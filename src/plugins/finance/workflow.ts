import { TaskEngine } from "../../core/engine.js";
import { Task } from "../../core/types.js";
import { SkillEngine } from "../../skills/types.js";
import { MemoryStore } from "../../memory/types.js";
import { TelemetryEmitter } from "../../observability/types.js";
import { ModelRouter } from "../../model/types.js";
import {
  FINANCE_TASK_TYPE,
  FinanceTaskInput,
  FinanceTaskSpec,
  FinanceAnalysisReport,
  ApprovalDecision,
  buildFinanceTaskMetadata,
} from "./types.js";
import { FINANCE_APPROVAL_POLICY } from "./policies.js";
import { FINANCE_AGENTS, FinanceAgentDeps, FinanceOrchestratorAgent } from "./agents/finance-agents.js";
import {
  FINANCE_VERIFIERS,
} from "./verification/verifiers.js";

/**
 * DARIUS Finance — portfolio analysis workflow (Phase 1 MVP).
 *
 * USER OBJECTIVE → OBSERVE → UNDERSTAND → PLAN → TASK GRAPH (research in
 * parallel) → SYNTHESIZE → CRITIC → REPORT → WAITING_APPROVAL →
 *   APPROVED → proposal record authorized (NO execution in Phase 1)
 *   REJECTED → cancel
 *
 * Everything runs on the EXISTING TaskEngine lifecycle:
 * the root task is a FINANCE_PORTFOLIO_ANALYSIS task executed by the
 * finance-orchestrator agent; verification is enforced by the Core's
 * verification hook using the finance custom verifiers.
 */

export interface FinanceWorkflowDeps extends FinanceAgentDeps {
  engine: TaskEngine;
  telemetry: TelemetryEmitter;
  modelRouter?: ModelRouter;
  /** Wall-clock budget for the whole analysis (excludes approval wait). */
  analysisTimeoutMs?: number;
  childTimeoutMs?: number;
}

const DEFAULT_ANALYSIS_TIMEOUT = 45000;

export class FinanceAnalysisWorkflow {
  private readonly deps: FinanceWorkflowDeps;
  private readonly analysisTimeoutMs: number;
  private readonly childTimeoutMs: number;

  constructor(deps: FinanceWorkflowDeps) {
    this.deps = deps;
    this.analysisTimeoutMs = deps.analysisTimeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT;
    this.childTimeoutMs = deps.childTimeoutMs ?? 20000;
  }

  /** Build the FinanceTaskSpec for a portfolio analysis (section 8 fields). */
  buildSpec(input: FinanceTaskInput, timeoutMs?: number): FinanceTaskSpec {
    return {
      type: FINANCE_TASK_TYPE,
      objective: "Analise minha carteira e explique os principais riscos, oportunidades e cenários.",
      context: JSON.stringify(input),
      priority: "HIGH",
      dependencies: [],
      tools: ["finance_market_data", "finance_economic_data", "finance_portfolio_data", "finance_calculator", "finance_scenario_simulator"],
      skills: ["finance-market-research", "finance-macro-snapshot", "finance-portfolio-analysis", "finance-risk-analysis", "finance-scenario-analysis", "finance-tax-review", "finance-critic-review", "finance-financial-report"],
      agents: Object.values(FINANCE_AGENTS),
      model: { reasoning: "reasoning", research: "research", critic: "critic" },
      risk: { level: "MEDIUM", approvalRequired: true },
      budget: { maxIterations: 6, maxRetries: 2 },
      timeoutMs: timeoutMs ?? this.analysisTimeoutMs,
      successCriteria: "Relatório estruturado com riscos, oportunidades, cenários, evidências, premissas e lacunas de dados declaradas.",
      verification: [
        { type: "CUSTOM", value: null, customVerifierId: FINANCE_VERIFIERS.reportSchema },
        { type: "CUSTOM", value: null, customVerifierId: FINANCE_VERIFIERS.mathConsistency },
        { type: "CUSTOM", value: null, customVerifierId: FINANCE_VERIFIERS.noMissingData },
        { type: "CUSTOM", value: null, customVerifierId: FINANCE_VERIFIERS.criticGate },
      ],
      approvalPolicy: FINANCE_APPROVAL_POLICY,
      artifacts: [],
    };
  }

  /**
   * Start an analysis. Returns the root task id immediately; the workflow
   * runs asynchronously and parks the task in WAITING_APPROVAL.
   */
  start(input: FinanceTaskInput, options?: { startedBy?: string }): { taskId: string; task: Task } {
    this.validateInput(input);

    const spec = this.buildSpec(input);
    const task = this.deps.engine.createTask(
      spec.objective,
      spec.context,
      buildFinanceTaskMetadata(spec)
    );

    this.deps.telemetry.emit({
      taskId: task.id,
      eventType: "TASK_CREATED",
      payload: { type: FINANCE_TASK_TYPE, startedBy: options?.startedBy ?? "api" },
    });

    // Fire-and-forget: executeTask resolves only after approval/timeout.
    void this.deps.engine
      .executeTask(task.id, FINANCE_AGENTS.orchestrator, this.analysisTimeoutMs)
      .catch(err => this.deps.telemetry.emit({
        taskId: task.id,
        eventType: "TASK_FAILED",
        payload: { error: err instanceof Error ? err.message : String(err) },
      }));

    return { taskId: task.id, task };
  }

  /**
   * Human approval. Records the decision in the MemoryStore and resumes the
   * task through the Core's native resume path.
   *
   * RC VALIDATION FIX: a decision must only be recorded for a task actually
   * parked in PAUSED. The Core rejects unknown ids outright, but its
   * resumeTask is still a silent no-op for a non-parked (wrong-status) task —
   * so this layer must validate BEFORE recording anything. Otherwise a
   * decision for a non-parked task would be written to the audit memory and
   * the API would report success while the task never resumed.
   */
  async approve(taskId: string, approver: string, comment?: string): Promise<void> {
    this.assertDecidable(taskId);
    await this.recordDecision(taskId, { taskId, decision: "APPROVED", approver, reason: comment, decidedAt: new Date().toISOString() });
    this.deps.engine.resumeTask(taskId);
  }

  /** Human rejection. Rejects via the Core's native reject path. */
  async reject(taskId: string, approver: string, reason: string): Promise<void> {
    this.assertDecidable(taskId);
    await this.recordDecision(taskId, { taskId, decision: "REJECTED", approver, reason, decidedAt: new Date().toISOString() });
    this.deps.engine.rejectTask(taskId, reason);
  }

  /** A decision is only valid for an existing task parked in PAUSED. */
  private assertDecidable(taskId: string): void {
    const task = this.deps.engine.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (task.status !== "PAUSED") {
      throw new Error(`Task ${taskId} is not awaiting approval (status: ${task.status})`);
    }
  }

  /** Current status of an analysis task. */
  getStatus(taskId: string): Task | undefined {
    return this.deps.engine.getTask(taskId);
  }

  /** Parse the final FinanceAnalysisReport from a COMPLETED task. */
  getReport(taskId: string): FinanceAnalysisReport | null {
    const task = this.deps.engine.getTask(taskId);
    if (!task || !task.result) return null;
    try {
      const start = task.result.indexOf("{");
      const end = task.result.lastIndexOf("}");
      return JSON.parse(task.result.slice(start, end + 1)) as FinanceAnalysisReport;
    } catch {
      return null;
    }
  }

  /** Draft report available while the task is parked in WAITING_APPROVAL. */
  async getDraft(taskId: string): Promise<FinanceAnalysisReport | null> {
    const entries = await this.deps.memory.search({
      metadataFilters: { domain: "finance", kind: "FINANCE_DRAFT", taskId },
      limit: 1,
    });
    if (entries.length === 0) return null;
    return JSON.parse(entries[0].content) as FinanceAnalysisReport;
  }

  /** Resolve when the task reaches a terminal state (or deadline). */
  async awaitCompletion(taskId: string, timeoutMs = 120000): Promise<Task> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const task = this.deps.engine.getTask(taskId);
      if (task && ["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
        return task;
      }
      await new Promise(r => setTimeout(r, 25));
    }
    const task = this.deps.engine.getTask(taskId);
    throw new Error(`Analysis ${taskId} did not reach a terminal state within ${timeoutMs}ms (status: ${task?.status})`);
  }

  /** Resolve when the task is PAUSED waiting for approval. */
  async awaitApprovalRequest(taskId: string, timeoutMs = 60000): Promise<Task> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const task = this.deps.engine.getTask(taskId);
      if (task && task.status === "PAUSED") return task;
      if (task && ["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
        throw new Error(`Analysis ${taskId} ended (${task.status}) without requesting approval: ${task.error ?? ""}`);
      }
      await new Promise(r => setTimeout(r, 25));
    }
    throw new Error(`Analysis ${taskId} never requested approval within ${timeoutMs}ms`);
  }

  private validateInput(input: FinanceTaskInput): void {
    if (!input || typeof input !== "object") {
      throw new Error("FinanceTaskInput is required");
    }
    if (!input.portfolio || !Array.isArray(input.portfolio.holdings) || input.portfolio.holdings.length === 0) {
      throw new Error("portfolio.holdings must be a non-empty array");
    }
    if (!input.portfolio.baseCurrency) {
      throw new Error("portfolio.baseCurrency is required");
    }
    for (const h of input.portfolio.holdings) {
      if (!h.symbol || typeof h.quantity !== "number" || !Number.isFinite(h.quantity) || h.quantity <= 0) {
        throw new Error(`Invalid holding: symbol and positive quantity are required (${JSON.stringify(h)})`);
      }
      if (!h.assetClass) {
        throw new Error(`Holding ${h.symbol} is missing assetClass`);
      }
    }
    if (!input.riskProfile) {
      throw new Error("riskProfile is required");
    }
  }

  private async recordDecision(taskId: string, decision: ApprovalDecision): Promise<void> {
    await this.deps.memory.save({
      type: "EPISODIC",
      content: JSON.stringify(decision),
      metadata: { domain: "finance", kind: "APPROVAL_DECISION", taskId },
      relevanceScore: 1,
    });
    this.deps.telemetry.emit({
      taskId,
      eventType: "EXECUTION_STEP",
      payload: { event: "APPROVAL_DECISION", decision: decision.decision, approver: decision.approver },
    });
  }
}
