import { describe, it, expect } from "vitest";
import { TaskEngine, InMemoryTaskStore } from "../../core/engine.js";
import { SimpleToolEngine } from "../../tools/engine.js";
import { SimpleSkillEngine } from "../../skills/engine.js";
import { InMemoryMemoryStore } from "../../memory/engine.js";
import { SimpleTelemetryEmitter } from "../../observability/engine.js";
import { DeterministicVerificationEngine } from "../../verification/engine.js";
import { PluginHost } from "../host.js";
import { createFinancePlugin, FinancePlugin } from "./plugin.js";
import { RouteRegistrarLike } from "../contract.js";
import { TelemetryEvent } from "../../observability/types.js";
import { FinanceTaskInput } from "./types.js";
import { SQLitePersistentStore } from "../../core/sqlite.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

/**
 * Offline E2E: USER OBJECTIVE → FINANCE TASK → PLAN → AGENTS → TOOLS →
 * CRITIC → VERIFY → WAITING_APPROVAL → APPROVE/REJECT → RESULT.
 * No external API, no live model, no network.
 */

function buildRuntime(options?: { withRoutes?: boolean }) {
  const store = new InMemoryTaskStore();
  const taskEngine = new TaskEngine(store);
  const toolEngine = new SimpleToolEngine();
  const skillEngine = new SimpleSkillEngine();
  const memory = new InMemoryMemoryStore();
  const telemetry = new SimpleTelemetryEmitter();
  const verifier = new DeterministicVerificationEngine();

  const telemetryEvents: TelemetryEvent[] = [];
  telemetry.subscribe(e => telemetryEvents.push(e));

  const capturedRoutes: Array<{ method: string; path: string }> = [];
  const registrar: RouteRegistrarLike = {
    get: (path) => capturedRoutes.push({ method: "GET", path }),
    post: (path) => capturedRoutes.push({ method: "POST", path }),
  };

  const host = new PluginHost({
    taskEngine,
    toolEngine,
    skillEngine,
    memory,
    telemetry,
    verifier,
    routes: options?.withRoutes === false ? undefined : registrar,
  });

  return { taskEngine, toolEngine, skillEngine, memory, telemetry, verifier, host, telemetryEvents, capturedRoutes };
}

const input: FinanceTaskInput = {
  portfolio: {
    baseCurrency: "BRL",
    holdings: [
      { symbol: "PETR4", assetClass: "EQUITY", quantity: 100 },     // 3.800
      { symbol: "BTC", assetClass: "CRYPTO", quantity: 0.02 },      // 5.000
      { symbol: "LFT", assetClass: "FIXED_INCOME", quantity: 1 },   // 14.000
      { symbol: "XPTO", assetClass: "OTHER", quantity: 5 },         // sem preço → lacuna
    ],
  },
  riskProfile: { declaredTolerance: "CONSERVATIVE", horizonMonths: 60, constraints: [] },
  questions: ["Estou exposto demais a cripto?"],
};

describe("DARIUS Finance — plugin registration", () => {
  it("registers agents, tools, skills, verifiers and routes on the host engines", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);

    const agentIds = rt.taskEngine.getAgents().map(a => a.id);
    for (const id of FinancePlugin.agentIds()) expect(agentIds).toContain(id);
    expect(agentIds.filter(id => id.startsWith("finance-")).length).toBe(7);

    const toolNames = rt.toolEngine.listTools().map(t => t.name);
    expect(toolNames).toEqual(expect.arrayContaining([
      "finance_market_data", "finance_economic_data", "finance_portfolio_data",
      "finance_calculator", "finance_scenario_simulator",
    ]));

    expect(rt.skillEngine.listSkills().filter(s => s.id.startsWith("finance-")).length).toBe(8);
    expect(rt.capturedRoutes.map(r => r.path)).toContain("/api/finance/analysis");
  });

  it("plugin can be applied only once; core keeps working without it", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);
    await expect(rt.host.apply(plugin)).rejects.toThrow(/already applied/);

    // Architectural test: without applying finance, TaskEngine works normally.
    const rt2 = buildRuntime();
    const t = rt2.taskEngine.createTask("objetivo puro do core");
    expect(t.objective).toBe("objetivo puro do core");
    expect(rt2.taskEngine.getAgents().filter(a => a.id.startsWith("finance-"))).toHaveLength(0);
  });

  it("custom verifiers are live in the host verification engine", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);

    const task = rt.taskEngine.createTask("verifier probe");
    task.metadata = {
      verification: [
        { type: "CUSTOM", value: null, customVerifierId: "finance_report_schema" },
      ],
    };
    const bad = await rt.verifier.verify(task, "no json here");
    expect(bad.passed).toBe(false);
  });
});

describe("DARIUS Finance — E2E workflow (offline)", () => {
  it("runs analysis → critic → report → WAITING_APPROVAL → approve → COMPLETED with verified report", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin({ analysisTimeoutMs: 15000, childTimeoutMs: 8000 });
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    const { taskId } = wf.start(input, { startedBy: "e2e-test" });

    // 1. Human approval gate: task parks in PAUSED (Core-native).
    const paused = await wf.awaitApprovalRequest(taskId, 20000);
    expect(paused.status).toBe("PAUSED");
    const draft = await wf.getDraft(taskId);
    expect(draft).toBeDefined();
    expect(Array.isArray(draft!.criticObjections)).toBe(true);

    // 2. Human approves → task completes THROUGH the verification hook.
    await wf.approve(taskId, "dario", "concordo com as premissas");
    const done = await wf.awaitCompletion(taskId, 20000);
    expect(done.status).toBe("COMPLETED");

    const report = wf.getReport(taskId);
    expect(report).not.toBeNull();
    expect(report!.taskType).toBe("FINANCE_PORTFOLIO_ANALYSIS");
    expect(report!.dataSource).toBe("MOCK_DEMO_DATA");

    // 3. Missing data declared — never invented.
    expect(report!.portfolioSummary.unpricedSymbols).toContain("XPTO");
    expect(report!.dataGaps.some(g => g.includes("XPTO"))).toBe(true);
    const xpto = report!.portfolioSummary.holdings.find(h => h.symbol === "XPTO");
    expect(xpto?.weight).toBeUndefined();

    // 4. Deterministic math made it through verification.
    expect(report!.portfolioSummary.pricedValue).toBe(22800); // 3800 + 5000 + 14000
    expect(report!.scenarios.some(s => s.id === "CRYPTO_CRASH_50" && s.portfolioImpactValue < 0)).toBe(true);

    // 5. Critic ran as a real stage.
    expect(Array.isArray(report!.criticObjections)).toBe(true);

    // 6. User question propagated.
    expect(report!.openQuestions.some(q => q.includes("cripto"))).toBe(true);

    // 7. Audit trail: tool calls were emitted (no params dump, no CoT).
    expect(rt.telemetryEvents.some(e => e.eventType === "TOOL_CALL")).toBe(true);

    // 8. Memory recorded the analysis + approval decision.
    const decisions = await rt.memory.search({ metadataFilters: { domain: "finance", kind: "APPROVAL_DECISION" } });
    expect(decisions).toHaveLength(1);
    const reports = await rt.memory.search({ metadataFilters: { kind: "ANALYSIS_REPORT" } });
    expect(reports.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("REJECTED analysis fails with an explicit REJECTED error and marks proposals rejected", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin({ analysisTimeoutMs: 15000, childTimeoutMs: 8000 });
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    const { taskId } = wf.start(input);
    await wf.awaitApprovalRequest(taskId, 20000);
    await wf.reject(taskId, "dario", "não quero seguir com isso agora");

    const done = await wf.awaitCompletion(taskId, 20000);
    expect(done.status).toBe("FAILED");
    expect(done.error).toMatch(/REJECTED/);

    const decision = await rt.memory.search({ metadataFilters: { kind: "APPROVAL_DECISION" } });
    expect(decision).toHaveLength(1);
    expect(JSON.parse(decision[0].content).decision).toBe("REJECTED");
  }, 30000);

  it("rejects malformed input synchronously (missing holdings, bad quantity)", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    expect(() => wf.start({ portfolio: { baseCurrency: "BRL", holdings: [] }, riskProfile: { declaredTolerance: "MODERATE", constraints: [] } })).toThrow(/non-empty/);
    expect(() => wf.start({
      portfolio: { baseCurrency: "BRL", holdings: [{ symbol: "PETR4", assetClass: "EQUITY", quantity: -1 }] },
      riskProfile: { declaredTolerance: "MODERATE", constraints: [] },
    })).toThrow(/positive quantity/);
    expect(() => wf.start({ portfolio: { baseCurrency: "BRL", holdings: [{ symbol: "A", assetClass: "EQUITY", quantity: 1 }] }, riskProfile: null as never })).toThrow(/riskProfile/);
  });

  it("subtask failure surfaces as a FAILED root task with the stage error (no silent swallowing)", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin({ analysisTimeoutMs: 15000, childTimeoutMs: 8000 });
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    // Sabotage: break the market research skill so its child task fails.
    const skills = rt.skillEngine as unknown as { skills: Map<string, { execute: (p: unknown, c: unknown) => Promise<unknown> }> };
    const research = skills.skills.get("finance-market-research");
    skills.skills.set("finance-market-research", {
      ...(research as { execute: (p: unknown, c: unknown) => Promise<unknown> }),
      execute: async () => { throw new Error("provider exploded"); },
    });

    const { taskId } = wf.start(input);
    const done = await wf.awaitCompletion(taskId, 20000);
    expect(done.status).toBe("FAILED");
    expect(done.error).toMatch(/market research.*did not complete|provider exploded/s);
  }, 30000);
});

describe("DARIUS Finance — approval decision guards (RC validation)", () => {
  it("approve on an unknown task throws and records NO audit decision", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    await expect(wf.approve("no-such-task", "rc-bot")).rejects.toThrow(/not found/i);

    const decisions = await rt.memory.search({ type: "EPISODIC" });
    expect(decisions.filter(e => (e.metadata as { kind?: string })?.kind === "APPROVAL_DECISION")).toHaveLength(0);
  });

  it("reject on an unknown task throws and records NO audit decision", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    await expect(wf.reject("no-such-task", "rc-bot", "nope")).rejects.toThrow(/not found/i);

    const decisions = await rt.memory.search({ type: "EPISODIC" });
    expect(decisions.filter(e => (e.metadata as { kind?: string })?.kind === "APPROVAL_DECISION")).toHaveLength(0);
  });

  it("approve on a task that is not parked in PAUSED throws (no fake audit)", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin({ analysisTimeoutMs: 15000, childTimeoutMs: 8000 });
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    // Synchronously after start() the task is still PENDING (execution is
    // fire-and-forget) — definitively not decidable.
    const { taskId } = wf.start(input);
    await expect(wf.approve(taskId, "rc-bot")).rejects.toThrow(/not awaiting approval/i);
    await expect(wf.reject(taskId, "rc-bot", "early")).rejects.toThrow(/not awaiting approval/i);

    const decisions = await rt.memory.search({ type: "EPISODIC" });
    expect(decisions.filter(e => (e.metadata as { kind?: string })?.kind === "APPROVAL_DECISION")).toHaveLength(0);
  });
});

describe("DARIUS Finance — API approval security matrix (final RC hardening)", () => {
  it("approve/reject on terminal tasks (COMPLETED, FAILED) throw and record NO new decision", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    // COMPLETED task
    const { taskId } = wf.start(input);
    await wf.awaitApprovalRequest(taskId, 20000);
    await wf.approve(taskId, "op");
    const done = await wf.awaitCompletion(taskId, 20000);
    expect(done.status).toBe("COMPLETED");
    await expect(wf.approve(taskId, "op", "late")).rejects.toThrow(/not awaiting approval/i);
    await expect(wf.reject(taskId, "op", "late")).rejects.toThrow(/not awaiting approval/i);

    // FAILED (REJECTED) task
    const { taskId: tid2 } = wf.start(input);
    await wf.awaitApprovalRequest(tid2, 20000);
    await wf.reject(tid2, "op", "no");
    await wf.awaitCompletion(tid2, 20000);
    await expect(wf.approve(tid2, "op", "resurrect")).rejects.toThrow(/not awaiting approval/i);
    await expect(wf.reject(tid2, "op", "again")).rejects.toThrow(/not awaiting approval/i);

    // No resurrection: both terminal tasks keep their outcomes
    expect(rt.taskEngine.getTask(taskId)?.status).toBe("COMPLETED");
    expect(rt.taskEngine.getTask(tid2)?.status).toBe("FAILED");
  }, 40000);

  it("double approval records at most one effective resume and completes exactly once", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    const { taskId } = wf.start(input);
    await wf.awaitApprovalRequest(taskId, 20000);

    const first = wf.approve(taskId, "op-a");
    await first; // effective: PAUSED -> RUNNING
    // Second approval: task is no longer PAUSED -> must throw, no fake audit
    await expect(wf.approve(taskId, "op-b")).rejects.toThrow(/not awaiting approval/i);

    const done = await wf.awaitCompletion(taskId, 20000);
    expect(done.status).toBe("COMPLETED");
    expect(done.result).toBeTruthy();
  }, 40000);

  it("concurrent approve+reject: exactly one decision takes effect, the other fails with 409-mapped error", async () => {
    const rt = buildRuntime();
    const plugin = createFinancePlugin();
    await rt.host.apply(plugin);
    const wf = plugin.getWorkflow();

    const { taskId } = wf.start(input);
    await wf.awaitApprovalRequest(taskId, 20000);

    // Fire both decisions concurrently (deterministic microtask order:
    // approve's engine transition runs before reject's).
    const outcomes = await Promise.allSettled([
      wf.approve(taskId, "op-approve"),
      wf.reject(taskId, "op-reject", "racing"),
    ]);

    const fulfilled = outcomes.filter(o => o.status === "fulfilled");
    const rejected = outcomes.filter(o => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject(
      expect.any(Error)
    );

    // The task must end in EXACTLY ONE coherent terminal state.
    const done = await wf.awaitCompletion(taskId, 20000);
    const effectiveDecision = fulfilled[0] as PromiseFulfilledResult<unknown>;
    void effectiveDecision;
    expect(["COMPLETED", "FAILED"]).toContain(done.status);
    if (done.status === "COMPLETED") {
      expect(done.result).toBeTruthy(); // approve won: verified report present
    } else {
      expect(done.error ?? "").toMatch(/REJECTED/); // reject won: explicit error
    }
  }, 40000);
});

describe("DARIUS Finance — report persistence across restart (final RC hardening)", () => {
  it("verified report and COMPLETED status survive a full store reopen (SQLite)", async () => {
    const dbPath = join(tmpdir(), `darius_rc_artifact_${Date.now()}_${process.pid}.db`);

    // Run 1: complete an analysis against a SQLite-backed engine.
    const store1 = new SQLitePersistentStore(dbPath);
    const engine1 = new TaskEngine(store1);
    const toolEngine1 = new SimpleToolEngine();
    const skillEngine1 = new SimpleSkillEngine();
    const memory1 = new InMemoryMemoryStore();
    const telemetry1 = new SimpleTelemetryEmitter();
    const verifier1 = new DeterministicVerificationEngine();
    const host1 = new PluginHost({
      taskEngine: engine1, toolEngine: toolEngine1, skillEngine: skillEngine1,
      memory: memory1, telemetry: telemetry1, verifier: verifier1,
    });
    const plugin1 = createFinancePlugin();
    await host1.apply(plugin1);
    const wf1 = plugin1.getWorkflow();

    const { taskId } = wf1.start(input);
    await wf1.awaitApprovalRequest(taskId, 20000);
    await wf1.approve(taskId, "op");
    const done1 = await wf1.awaitCompletion(taskId, 20000);
    expect(done1.status).toBe("COMPLETED");
    const report1 = wf1.getReport(taskId);
    expect(report1).toBeTruthy();
    store1.close();

    // Run 2: a brand-new engine over the SAME file simulates a process restart.
    const store2 = new SQLitePersistentStore(dbPath);
    const engine2 = new TaskEngine(store2);
    const task2 = engine2.getTask(taskId);
    expect(task2?.status).toBe("COMPLETED");
    expect(task2?.result).toBe(done1.result);

    // A fresh workflow over the restarted engine still serves the report.
    const host2 = new PluginHost({
      taskEngine: engine2, toolEngine: new SimpleToolEngine(), skillEngine: new SimpleSkillEngine(),
      memory: new InMemoryMemoryStore(), telemetry: new SimpleTelemetryEmitter(), verifier: new DeterministicVerificationEngine(),
    });
    const plugin2 = createFinancePlugin();
    await host2.apply(plugin2);
    const report2 = plugin2.getWorkflow().getReport(taskId);
    expect(report2).toEqual(report1);
    store2.close();
    try { rmSync(dbPath); } catch { /* temp cleanup best-effort */ }
  }, 40000);
});
