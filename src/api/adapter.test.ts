import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryTaskStore } from "../core/engine.js";
import { SimpleTelemetryEmitter } from "../observability/engine.js";
import { DARIUSUIAdapter } from "./adapter.js";
import { TaskEngine } from "../core/engine.js";
import { InMemoryMemoryStore } from "../memory/engine.js";
import { SimpleToolEngine } from "../tools/engine.js";
import { Agent } from "../core/types.js";

describe("DARIUSUIAdapter", () => {
  let adapter: DARIUSUIAdapter;
  let taskEngine: TaskEngine;

  const dummyAgent: Agent = {
    id: "ui-agent",
    name: "UI Agent",
    observe: async () => "observed UI",
    think: async () => {
      // Add artificial delay to give us time to pause
      await new Promise(r => setTimeout(r, 50));
      return "thinking UI";
    },
    act: async (t, ctx) => {
      if (ctx.iterations === 1) return "DONE: UI Done";
      return "acted";
    }
  };

  beforeEach(() => {
    taskEngine = new TaskEngine(undefined, { maxIterations: 5 });
    taskEngine.registerAgent(dummyAgent);
    const memory = new InMemoryMemoryStore();
    const tools = new SimpleToolEngine();

    adapter = new DARIUSUIAdapter(taskEngine, memory, tools);
  });

  it("should capture execution logs when a task runs", async () => {
    const task = taskEngine.createTask("UI Test");

    // We expect the adapter to capture TASK_CREATED event immediately
    const metricsBefore = adapter.getDashboardMetrics();
    expect(metricsBefore.recentActivities.length).toBeGreaterThan(0);
    expect(metricsBefore.recentActivities[0].payload.objective).toBe("UI Test");

    await taskEngine.executeTask(task.id, dummyAgent.id);

    const metricsAfter = adapter.getDashboardMetrics();
    // Should have captured Observe, Think, Act, Done, etc.
    const activities = metricsAfter.recentActivities;

    const hasObserve = activities.some(a => a.eventType === "OBSERVE");
    const hasThink = activities.some(a => a.eventType === "THINK");
    const hasAct = activities.some(a => a.eventType === "ACT");

    expect(hasObserve).toBe(true);
    expect(hasThink).toBe(true);
    expect(hasAct).toBe(true);

    const hasFinished = activities.some(a => a.eventType === "FINISHED");
    expect(hasFinished).toBe(true);
  });

  it("should not expose mocked data in dashboard metrics", () => {
    const metrics = adapter.getDashboardMetrics();
    expect(metrics.health.status).toBe("UNKNOWN");
    expect(metrics.health.latencyMs).toBeUndefined();
    expect(metrics.health.memoryUsageMB).toBeUndefined();
    expect(metrics.activeAgents).toBeUndefined();
    expect(metrics.pausedAgents).toBeUndefined();
  });

  it("should correctly associate tasks strictly by agentId", async () => {
    const task = taskEngine.createTask("Agent Assoc Test");
    await taskEngine.executeTask(task.id, dummyAgent.id);

    const agentDetails = adapter.getAgentDetails(dummyAgent.id);
    expect(agentDetails).toBeDefined();

    // Explicitly confirm it is NOT returning mocked skills array
    expect(agentDetails?.skillsAttached).toEqual([]);

    expect(agentDetails?.recentTasks.length).toBe(1);
    expect(agentDetails?.recentTasks[0].id).toBe(task.id);
  });

  it("should support pause and resume for human approval", async () => {
    const task = taskEngine.createTask("Approval Test");

    // We start execution, but immediately pause it
    const execPromise = taskEngine.executeTask(task.id, dummyAgent.id);

    // Slight delay to ensure it's in RUNNING state but caught before completion
    await new Promise(r => setTimeout(r, 10));
    adapter.pauseTask(task.id);

    const state = adapter.getTaskState(task.id);
    expect(state?.status).toBe("PAUSED");

    adapter.resumeTask(task.id);
    const finishedTask = await execPromise;
    expect(finishedTask.status).toBe("COMPLETED");
  });
});

/**
 * NO-CoT surface contract (final RC hardening): the UI trace exposed by
 * /api/tasks/:id must never contain the agent's internal THINK reasoning,
 * regardless of the agent implementation. Results/evidence (ACT output) and
 * verification output remain visible per the product spec.
 */
describe("DARIUSUIAdapter — no chain-of-thought leak", () => {
  it("trace THINK outputs are withheld; ACT result stays visible", async () => {
    const taskEngine = new TaskEngine(new InMemoryTaskStore());
    const telemetry = new SimpleTelemetryEmitter();
    const adapter = new DARIUSUIAdapter(taskEngine, new InMemoryMemoryStore(), new SimpleToolEngine(), telemetry);

    const cotAgent: Agent = {
      id: "cot-agent",
      name: "CoT Agent",
      observe: async () => "observation summary",
      think: async () => "SECRET-INTERNAL-REASONING: plan step 3 relies on...",
      act: async () => "DONE: public result with evidence",
    };
    taskEngine.registerAgent(cotAgent);

    const task = taskEngine.createTask("surface contract");
    await taskEngine.executeTask(task.id, cotAgent.id, 5000);
    expect(taskEngine.getTask(task.id)?.status).toBe("COMPLETED");

    const state = adapter.getTaskState(task.id);
    expect(state).not.toBeNull();
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("SECRET-INTERNAL-REASONING");

    const trace = (state!.trace as Array<{ state: string; output?: string }>);
    const thinkSteps = trace.filter(s => s.state === "THINK");
    expect(thinkSteps.length).toBeGreaterThan(0);
    for (const s of thinkSteps) {
      expect(s.output).toBe("(internal planning step — content not exposed)");
    }

    // Result/evidence stays public.
    const actSteps = trace.filter(s => s.state === "ACT");
    expect(actSteps.some(s => (s.output ?? "").includes("public result"))).toBe(true);
  });
});

/**
 * NO-CoT full-surface sentinel matrix (release freeze, §3): the sentinel
 * string is injected as an agent's raw THINK output and must not appear on
 * ANY public adapter surface — task detail (/api/tasks/:id + Web execution
 * trace), agent detail (/api/agents/:id incl. recentTasks), or the event
 * log surfaces (/api/dashboard, /api/logs). Structural guarantees: public
 * task summaries never carry metadata/executionHistory at all.
 */
describe("DARIUSUIAdapter — no-CoT full-surface sentinel matrix", () => {
  it("sentinel THINK reasoning never reaches any public surface", async () => {
    const taskEngine = new TaskEngine(new InMemoryTaskStore());
    const telemetry = new SimpleTelemetryEmitter();
    const adapter = new DARIUSUIAdapter(taskEngine, new InMemoryMemoryStore(), new SimpleToolEngine(), telemetry);

    const SENTINEL = "SECRET_INTERNAL_THOUGHT_SENTINEL";
    const sentinelAgent: Agent = {
      id: "sentinel-agent",
      name: "Sentinel Agent",
      observe: async () => "observe summary",
      think: async () => `${SENTINEL} hidden plan relies on step 3`,
      act: async () => "DONE: PUBLIC_RESULT_SENTINEL final report",
    };
    taskEngine.registerAgent(sentinelAgent);

    const task = taskEngine.createTask("sentinel matrix probe");
    await taskEngine.executeTask(task.id, sentinelAgent.id, 5000);
    expect(taskEngine.getTask(task.id)?.status).toBe("COMPLETED");

    // 1. /api/tasks/:id — task detail + Web execution trace
    const taskDetail = JSON.stringify(adapter.getTaskState(task.id));
    // 2. /api/agents/:id — agent detail including recentTasks
    const agentDetail = JSON.stringify(adapter.getAgentDetails(sentinelAgent.id));
    // 3. /api/dashboard and /api/logs — event payload surface
    const dashboardAndLogs = JSON.stringify(adapter.getDashboardMetrics());

    const surfaces: Array<[string, string]> = [
      ["/api/tasks/:id", taskDetail],
      ["/api/agents/:id", agentDetail],
      ["/api/dashboard,/api/logs", dashboardAndLogs],
    ];
    for (const [surface, body] of surfaces) {
      expect(body, `chain-of-thought leaked through ${surface}`).not.toContain(SENTINEL);
    }

    // Structural: agent-borne task summaries must not carry execution
    // metadata at all (raw executionHistory is the leak vector).
    expect(agentDetail).not.toContain("executionHistory");
    expect(agentDetail).not.toContain('"metadata"');

    // False-green guard: the public result DID reach the detail surface,
    // proving the probe actually executed content end-to-end.
    expect(taskDetail).toContain("PUBLIC_RESULT_SENTINEL");
  });
});
