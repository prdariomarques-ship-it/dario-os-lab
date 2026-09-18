import { Agent, Task, TaskExecution } from "../../../core/types.js";
import { SkillEngine } from "../../../skills/types.js";
import { ModelRouter } from "../../../model/types.js";
import { CompiledContext } from "../../../context/types.js";
import { MemoryStore } from "../../../memory/types.js";
import {
  FinanceTaskInput,
  FinanceAnalysisReport,
  HypotheticalAction,
  ApprovalDecision,
} from "../types.js";
import {
  FINANCE_SKILLS,
  ResearchOutput,
} from "../skills/index.js";

/**
 * DARIUS Finance — specialized agents.
 *
 * Each agent implements the EXISTING core `Agent` contract
 * (observe → think → act, terminating with "DONE: <payload>").
 * Agents orchestrate; skills execute; tools compute. No agent talks to a
 * provider or model directly except the optional narrative hook via the
 * existing ModelRouter (capability-based, never hardcoded to a vendor).
 *
 * Phase 1 is fully deterministic and offline: no live LLM is required.
 */

export const FINANCE_AGENTS = {
  research: "finance-research",
  macro: "finance-macro",
  portfolio: "finance-portfolio",
  risk: "finance-risk",
  tax: "finance-tax",
  critic: "finance-critic",
  orchestrator: "finance-orchestrator",
} as const;

export interface FinanceAgentDeps {
  skillEngine: SkillEngine;
  memory: MemoryStore;
  /** Optional: capability-based narrative generation (existing ModelRouter). */
  modelRouter?: ModelRouter;
  /** Capability name to request from the router (default "reasoning"). */
  reasoningCapability?: string;
}

function parseInput(task: Task): FinanceTaskInput {
  if (!task.context) {
    throw new Error("Finance task is missing context (FinanceTaskInput JSON)");
  }
  const input = JSON.parse(task.context) as FinanceTaskInput;
  if (!input.portfolio || !Array.isArray(input.portfolio.holdings)) {
    throw new Error("FinanceTaskInput.portfolio.holdings is required");
  }
  if (!input.riskProfile) {
    throw new Error("FinanceTaskInput.riskProfile is required");
  }
  input.riskProfile.constraints = input.riskProfile.constraints ?? [];
  return input;
}

/** Collects the previous-stage outputs embedded by the orchestrator. */
function parseStageResults<T>(task: Task): T {
  if (!task.context) throw new Error("Missing stage results in task context");
  return JSON.parse(task.context) as T;
}

async function maybeNarrative(
  deps: FinanceAgentDeps,
  report: FinanceAnalysisReport
): Promise<string | undefined> {
  if (!deps.modelRouter) return undefined;
  try {
    // Minimal deterministic context: summary facts only (never chain-of-thought).
    const compiled: CompiledContext = {
      taskObjective: `Resumir análise de carteira (confiança ${report.confidence})`,
      chunks: [],
      totalTokens: 0,
      fullPrompt:
        `Resuma em até 4 frases, em português, os riscos e oportunidades desta análise. ` +
        `NÃO invente dados. Fatos: HHI=${report.portfolioSummary.concentrationHHI}, ` +
        `top=${report.portfolioSummary.topWeight}, cenários=${report.scenarios.length}, ` +
        `lacunas=${report.dataGaps.length}.`,
    };
    const response = await deps.modelRouter.route(
      { context: compiled },
      [deps.reasoningCapability ?? "reasoning"]
    );
    return response.text;
  } catch {
    // Narrative is decorative: deterministic path must never fail because of it.
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Research family: one agent per area, all delegating to their skill
// ---------------------------------------------------------------------------

export class FinanceResearchAgent implements Agent {
  id = FINANCE_AGENTS.research;
  name = "Finance Research Agent";
  description = "Pesquisa de mercado: cotações, evidências rotuladas e lacunas de dados.";
  constructor(private deps: FinanceAgentDeps) {}

  async observe(task: Task): Promise<string> {
    const input = parseInput(task);
    return `OBSERVE: ${input.portfolio.holdings.length} posições declaradas; base ${input.portfolio.baseCurrency}.`;
  }

  async think(): Promise<string> {
    return "THINK: executar skill finance-market-research via Skill Engine.";
  }

  async act(task: Task): Promise<string> {
    const input = parseInput(task);
    const output = (await this.deps.skillEngine.executeSkill(
      FINANCE_SKILLS.marketResearch,
      { input },
      { taskId: task.id, input }
    )) as ResearchOutput;
    return "DONE:" + JSON.stringify(output);
  }
}

export class FinanceMacroAgent implements Agent {
  id = FINANCE_AGENTS.macro;
  name = "Macro Agent";
  description = "Juros, inflação e câmbio: snapshot rotulado, sem previsões.";
  constructor(private deps: FinanceAgentDeps) {}

  async observe(task: Task): Promise<string> {
    parseInput(task);
    return "OBSERVE: coletar indicadores macroeconômicos disponíveis.";
  }
  async think(): Promise<string> {
    return "THINK: executar skill finance-macro-snapshot.";
  }
  async act(task: Task): Promise<string> {
    const input = parseInput(task);
    const output = (await this.deps.skillEngine.executeSkill(
      FINANCE_SKILLS.macroSnapshot,
      { input },
      { taskId: task.id, input }
    )) as ResearchOutput;
    return "DONE:" + JSON.stringify(output);
  }
}

export class FinancePortfolioAgent implements Agent {
  id = FINANCE_AGENTS.portfolio;
  name = "Portfolio Agent";
  description = "Alocação, concentração, diversificação e rebalanceamento hipotético.";
  constructor(private deps: FinanceAgentDeps) {}

  async observe(task: Task): Promise<string> {
    const input = parseInput(task);
    return `OBSERVE: precificar ${input.portfolio.holdings.length} posições e medir concentração.`;
  }
  async think(): Promise<string> {
    return "THINK: executar skill finance-portfolio-analysis.";
  }
  async act(task: Task): Promise<string> {
    const input = parseInput(task);
    const output = (await this.deps.skillEngine.executeSkill(
      FINANCE_SKILLS.portfolioAnalysis,
      { input },
      { taskId: task.id, input }
    )) as ResearchOutput;
    return "DONE:" + JSON.stringify(output);
  }
}

export class FinanceRiskAgent implements Agent {
  id = FINANCE_AGENTS.risk;
  name = "Risk Agent";
  description = "Volatilidade, drawdown, exposição e cenários adversos.";
  constructor(private deps: FinanceAgentDeps) {}

  async observe(task: Task): Promise<string> {
    const input = parseInput(task);
    return `OBSERVE: medir risco da carteira para tolerância declarada ${input.riskProfile.declaredTolerance}.`;
  }
  async think(): Promise<string> {
    return "THINK: executar skills finance-risk-analysis e finance-scenario-analysis.";
  }
  async act(task: Task): Promise<string> {
    const input = parseInput(task);
    const riskOut = (await this.deps.skillEngine.executeSkill(
      FINANCE_SKILLS.riskAnalysis,
      { input },
      { taskId: task.id, input }
    )) as ResearchOutput;
    const scenarioOut = (await this.deps.skillEngine.executeSkill(
      FINANCE_SKILLS.scenarioAnalysis,
      { input },
      { taskId: task.id, input }
    )) as ResearchOutput;
    const merged: ResearchOutput = {
      ...riskOut,
      evidence: [...riskOut.evidence, ...scenarioOut.evidence],
      findings: [...riskOut.findings, ...scenarioOut.findings],
      notes: [...riskOut.notes, ...scenarioOut.notes],
      scenarios: scenarioOut.scenarios ?? [],
    };
    return "DONE:" + JSON.stringify(merged);
  }
}

export class FinanceTaxAgent implements Agent {
  id = FINANCE_AGENTS.tax;
  name = "Tax Agent";
  description = "Análise tributária limitada aos dados declarados; sem regras de jurisdição no MVP.";
  constructor(private deps: FinanceAgentDeps) {}

  async observe(task: Task): Promise<string> {
    const input = parseInput(task);
    const withCost = input.portfolio.holdings.filter(h => typeof h.avgCost === "number").length;
    return `OBSERVE: ${withCost} posições com custo declarado.`;
  }
  async think(): Promise<string> {
    return "THINK: executar skill finance-tax-review.";
  }
  async act(task: Task): Promise<string> {
    const input = parseInput(task);
    const output = (await this.deps.skillEngine.executeSkill(
      "finance-tax-review",
      { input },
      { taskId: task.id, input }
    )) as ResearchOutput;
    return "DONE:" + JSON.stringify(output);
  }
}

// ---------------------------------------------------------------------------
// Critic: real workflow stage, tries to invalidate the draft report
// ---------------------------------------------------------------------------

export class FinanceCriticAgent implements Agent {
  id = FINANCE_AGENTS.critic;
  name = "Critic Agent";
  description = "Tenta invalidar premissas, dados e conclusões do rascunho de relatório.";
  constructor(private deps: FinanceAgentDeps) {}

  async observe(): Promise<string> {
    return "OBSERVE: revisar rascunho do relatório financeiro.";
  }
  async think(): Promise<string> {
    return "THINK: executar skill finance-critic-review e registrar objeções.";
  }
  async act(task: Task): Promise<string> {
    const { report, input } = parseStageResults<{ report: FinanceAnalysisReport; input: FinanceTaskInput }>(task);
    const { objections } = (await this.deps.skillEngine.executeSkill(
      FINANCE_SKILLS.criticReview,
      { report, input },
      { taskId: task.id, input }
    )) as { objections: FinanceAnalysisReport["criticObjections"] };
    return "DONE:" + JSON.stringify({ objections });
  }
}

// ---------------------------------------------------------------------------
// Orchestrator: runs the research graph, synthesis, critic, report and the
// approval gate — using ONLY existing TaskEngine APIs.
// ---------------------------------------------------------------------------

export class FinanceOrchestratorAgent implements Agent {
  id = FINANCE_AGENTS.orchestrator;
  name = "Finance Orchestrator";
  description = "Coordena análise FINANCE_PORTFOLIO_ANALYSIS de ponta a ponta e parca em WAITING_APPROVAL.";

  constructor(
    private deps: FinanceAgentDeps,
    private engine: { createTask(objective: string, context?: string, metadata?: Record<string, unknown>): Task; executeTask(taskId: string, agentId: string, timeoutMs?: number): Promise<Task>; pauseForApproval(taskId: string): void; getTask(id: string): Task | undefined },
    private childTimeoutMs = 20000,
    private approvalMemoryKey = "finance:approval"
  ) {}

  async observe(task: Task): Promise<string> {
    parseInput(task);
    return "OBSERVE: objetivo financeiro recebido; plano = pesquisa paralela → síntese → crítica → relatório → aprovação.";
  }

  async think(): Promise<string> {
    return "THINK: delegar etapas aos agentes especializados via TaskEngine existente.";
  }

  async act(task: Task, execution: TaskExecution): Promise<string> {
    const input = parseInput(task);

    // After resume from WAITING_APPROVAL: check the decision recorded in memory.
    if (execution.iterations > 1) {
      return this.finalizeAfterApproval(task);
    }

    // ---- Stage 1: parallel research (macro, market, portfolio, risk, tax) ----
    const researchPlan: Array<{ agentId: string; label: string }> = [
      { agentId: FINANCE_AGENTS.research, label: "market research" },
      { agentId: FINANCE_AGENTS.macro, label: "macro snapshot" },
      { agentId: FINANCE_AGENTS.portfolio, label: "portfolio analysis" },
      { agentId: FINANCE_AGENTS.risk, label: "risk analysis" },
      { agentId: FINANCE_AGENTS.tax, label: "tax review" },
    ];

    const researchResults = await Promise.all(
      researchPlan.map(async ({ agentId, label }) => {
        const child = this.engine.createTask(
          `FINANCE subtask (${label}) for ${task.id}`,
          task.context,
          { type: "FINANCE_RESEARCH_SUBTASK", parentTaskId: task.id, area: agentId }
        );
        const done = await this.engine.executeTask(child.id, agentId, this.childTimeoutMs);
        if (done.status !== "COMPLETED" || !done.result) {
          throw new Error(`Finance research stage '${label}' did not complete: ${done.error ?? done.status}`);
        }
        return JSON.parse(done.result) as ResearchOutput;
      })
    );

    // ---- Stage 2: synthesis (draft report) ----
    const draft = (await this.deps.skillEngine.executeSkill(
      FINANCE_SKILLS.financialReport,
      { input, research: researchResults, objections: [] },
      { taskId: task.id, input }
    )) as FinanceAnalysisReport;

    // ---- Stage 3: critic (real stage, own task through the TaskEngine) ----
    const criticTask = this.engine.createTask(
      `FINANCE critic for ${task.id}`,
      JSON.stringify({ report: draft, input }),
      { type: "FINANCE_CRITIC_SUBTASK", parentTaskId: task.id }
    );
    const criticDone = await this.engine.executeTask(criticTask.id, FINANCE_AGENTS.critic, this.childTimeoutMs);
    if (criticDone.status !== "COMPLETED" || !criticDone.result) {
      throw new Error(`Finance critic stage did not complete: ${criticDone.error ?? criticDone.status}`);
    }
    const { objections } = JSON.parse(criticDone.result) as { objections: FinanceAnalysisReport["criticObjections"] };

    // Apply critic resolutions into the final draft.
    draft.criticObjections = objections;
    if (objections.some(o => o.id === "C1")) {
      draft.confidence = Math.min(draft.confidence, 0.6);
    }
    if (objections.some(o => o.id === "C3")) {
      draft.dataSource = draft.dataSource === "USER_DECLARED" ? "MIXED" : draft.dataSource;
    }

    // Optional narrative via the existing ModelRouter (capability-based).
    draft.narrative = await maybeNarrative(this.deps, draft);

    // ---- Stage 4: park for human approval (Core-native gate) ----
    // Persist the draft in MemoryStore BEFORE pausing: the TaskEngine's store
    // snapshot taken by pauseForApproval predates this act's metadata write,
    // so the paused task metadata is NOT a reliable draft carrier.
    await this.deps.memory.save({
      type: "SHORT_TERM",
      content: JSON.stringify(draft),
      metadata: { domain: "finance", kind: "FINANCE_DRAFT", taskId: task.id },
      relevanceScore: 0.9,
    });
    task.metadata = { ...task.metadata, financeDraft: draft };
    this.engine.pauseForApproval(task.id);
    return "PAUSED_FOR_APPROVAL:" + JSON.stringify(draft);
  }

  private async finalizeAfterApproval(task: Task): Promise<string> {
    const decision = await this.readDecision(task.id);
    if (!decision) {
      throw new Error("Resumed without a recorded approval decision — refusing to continue");
    }
    const draft = (await this.readDraft(task.id)) ?? (task.metadata?.financeDraft as FinanceAnalysisReport | undefined);
    if (!draft) throw new Error("Missing finance draft for finalization");

    if (decision.decision === "REJECTED") {
      // mark proposals as rejected for audit trail
      draft.hypotheticalActions = draft.hypotheticalActions.map(a => ({ ...a, status: "REJECTED" as const }));
    } else {
      draft.hypotheticalActions = draft.hypotheticalActions.map(a => ({ ...a, status: "APPROVED" as const }));
    }

    // Phase 1: NOTHING executes after approval. Approval only authorizes the
    // proposal record (Phase 3 will attach authorized-action tooling).
    const memory = this.deps.memory;
    await memory.save({
      type: "EPISODIC",
      content: `Análise financeira ${task.id} finalizada. Decisão humana: ${decision.decision} por ${decision.approver}. Ações hipotéticas: ${draft.hypotheticalActions.length}.`,
      metadata: { domain: "finance", kind: "ANALYSIS_REPORT", source: "model-inference", taskId: task.id, confidence: draft.confidence },
      relevanceScore: 0.7,
    });

    return "DONE:" + JSON.stringify(draft);
  }

  private async readDecision(taskId: string): Promise<ApprovalDecision | null> {
    const entries = await this.deps.memory.search({
      contentContains: taskId,
      metadataFilters: { domain: "finance", kind: "APPROVAL_DECISION" },
      limit: 1,
    });
    if (entries.length === 0) return null;
    return JSON.parse(entries[0].content) as ApprovalDecision;
  }

  private async readDraft(taskId: string): Promise<FinanceAnalysisReport | null> {
    const entries = await this.deps.memory.search({
      metadataFilters: { domain: "finance", kind: "FINANCE_DRAFT", taskId },
      limit: 1,
    });
    if (entries.length === 0) return null;
    return JSON.parse(entries[0].content) as FinanceAnalysisReport;
  }
}

/** Register every finance agent on the existing TaskEngine. */
export function createFinanceAgents(deps: FinanceAgentDeps): Agent[] {
  return [
    new FinanceResearchAgent(deps),
    new FinanceMacroAgent(deps),
    new FinancePortfolioAgent(deps),
    new FinanceRiskAgent(deps),
    new FinanceTaxAgent(deps),
    new FinanceCriticAgent(deps),
  ];
}

export type { HypotheticalAction };
