import { describe, it, expect } from "vitest";
import { TaskEngine, InMemoryTaskStore } from "./engine.js";
import { Agent, Task, TaskExecution } from "./types.js";

/**
 * FINAL RC HARDENING — execution budget semantics.
 *
 * Model being enforced (user-approved architecture):
 *   - The execution timeout measures ACTIVE execution time only.
 *   - WAITING_APPROVAL (human gate) must NOT consume active budget.
 *   - The timer must NEVER convert PAUSED -> FAILED("timed out") and must
 *     never overwrite a CANCELLED / REJECTED outcome that landed during the
 *     last await. Timeout only fires over genuine active RUNNING time.
 *
 * D1: pause lands during a long act() and the timer fires before act returns
 *     -> current code flips PAUSED to FAILED("timed out"), destroying the
 *     approval window. These tests reproduce it deterministically.
 * D2: timer fires while the task is already CANCELLED or FAILED(REJECTED)
 *     -> current code overwrites the audit-relevant error text.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForStatus(engine: TaskEngine, taskId: string, status: string, timeoutMs = 3000) {
  for (let i = 0; i < timeoutMs / 10; i++) {
    const t = engine.getTask(taskId);
    if (t?.status === status) return t;
    await sleep(10);
  }
  return engine.getTask(taskId);
}

/** Pauses itself at the START of act, then keeps working past any short budget. */
class PauseThenSlowAgent implements Agent {
  id = "pause-then-slow";
  name = "Pause Then Slow";
  public actCalls = 0;
  constructor(private engine: TaskEngine, private slowMs: number) {}
  async observe(): Promise<string> { return "observe"; }
  async think(): Promise<string> { return "think"; }
  async act(task: Task): Promise<string> {
    this.actCalls += 1;
    if (this.actCalls === 1) {
      this.engine.pauseForApproval(task.id); // lands DURING this act call
      await sleep(this.slowMs);              // act outlives the budget
      return "PAUSED_FOR_APPROVAL: draft";
    }
    return "DONE: finalized";
  }
}

/** Never pauses; simply overruns any short budget inside act. */
class OverrunningAgent implements Agent {
  id = "overrunning";
  name = "Overrunning";
  constructor(private slowMs: number) {}
  async observe(): Promise<string> { return "observe"; }
  async think(): Promise<string> { return "think"; }
  async act(): Promise<string> {
    await sleep(this.slowMs);
    return "DONE: too late";
  }
}

/** Simple-path agent (execute-only) that pauses itself then overruns. */
class SimplePauseSlowAgent implements Agent {
  id = "simple-pause-slow";
  name = "Simple Pause Slow";
  public executeCalls = 0;
  constructor(private engine: TaskEngine, private slowMs: number) {}
  async execute(task: Task): Promise<string> {
    this.executeCalls += 1;
    if (this.executeCalls === 1) {
      this.engine.pauseForApproval(task.id);
      await sleep(this.slowMs);
      return "PAUSED_FOR_APPROVAL: draft";
    }
    return "DONE: finalized";
  }
}

describe("TaskEngine budget semantics (final RC hardening)", () => {
  it("D1 (OOTA): timer firing while a self-paused act is still running must keep WAITING_APPROVAL, then approve completes after a long human wait", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new PauseThenSlowAgent(engine, 500);
    engine.registerAgent(agent);

    const task = engine.createTask("budget semantics");
    const done = engine.executeTask(task.id, agent.id, 200); // budget < slow act

    const parked = await waitForStatus(engine, task.id, "PAUSED", 1500);
    expect(parked?.status).toBe("PAUSED");

    // Human thinks for LONGER than the entire budget...
    await sleep(700);

    // ...the task must still be parked (never flipped to FAILED by the timer).
    expect(engine.getTask(task.id)?.status).toBe("PAUSED");
    expect(engine.getTask(task.id)?.error ?? "").not.toMatch(/timed out/i);

    engine.resumeTask(task.id);
    const result = await done;
    expect(result.status).toBe("COMPLETED");
    expect(result.result).toBe("finalized");
    expect(agent.actCalls).toBe(2);
  }, 15000);

  it("D1 (simple path): timer firing during a self-paused long execute must keep PAUSED and complete after approval", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new SimplePauseSlowAgent(engine, 500);
    engine.registerAgent(agent);

    const task = engine.createTask("simple budget semantics");
    const done = engine.executeTask(task.id, agent.id, 200);

    const parked = await waitForStatus(engine, task.id, "PAUSED", 1500);
    expect(parked?.status).toBe("PAUSED");

    await sleep(700); // human wait longer than the whole budget
    expect(engine.getTask(task.id)?.status).toBe("PAUSED");
    expect(engine.getTask(task.id)?.error ?? "").not.toMatch(/timed out/i);

    // Simple path: the first loop resolves while parked (Path B resume).
    // Resume re-enters a fresh loop — observe the STORE for completion.
    // NOTE: the simple path stores the raw execute() output (including the
    // "DONE: " prefix) — pre-existing cosmetic inconsistency vs the OOTA
    // path, documented in the hardening report (not changed during freeze).
    engine.resumeTask(task.id);
    const result = await waitForStatus(engine, task.id, "COMPLETED", 5000);
    expect(result?.status).toBe("COMPLETED");
    expect(result?.result ?? "").toMatch(/finalized$/);
    expect(agent.executeCalls).toBe(2);
  }, 15000);

  it("D2: timer firing after a CANCELLED that landed during act must keep CANCELLED", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new class implements Agent {
      id = "cancel-during-act";
      name = "Cancel During Act";
      async observe(): Promise<string> { return "observe"; }
      async think(): Promise<string> { return "think"; }
      async act(task: Task): Promise<string> {
        engine.cancelTask(task.id); // lands DURING act, before the timer
        await sleep(500);           // outlives the budget
        return "DONE: ignored";
      }
    }();
    engine.registerAgent(agent);

    const task = engine.createTask("cancel semantics");
    const done = engine.executeTask(task.id, agent.id, 200);
    const result = await done;
    expect(result.status).toBe("CANCELLED");
  }, 15000);

  it("D2: timer firing after a REJECTED that landed during act must preserve the REJECTED error", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new class implements Agent {
      id = "reject-during-act";
      name = "Reject During Act";
      async observe(): Promise<string> { return "observe"; }
      async think(): Promise<string> { return "think"; }
      async act(task: Task): Promise<string> {
        // Park first (reject requires PAUSED), then reject, then keep working.
        engine.pauseForApproval(task.id);
        engine.rejectTask(task.id, "not acceptable");
        await sleep(500); // outlives the budget
        return "DONE: ignored";
      }
    }();
    engine.registerAgent(agent);

    const task = engine.createTask("reject semantics");
    await engine.executeTask(task.id, agent.id, 200);
    const final = engine.getTask(task.id);
    expect(final?.status).toBe("FAILED");
    expect(final?.error ?? "").toMatch(/^REJECTED: not acceptable$/);
  }, 15000);

  it("genuine active overrun is still a timeout: RUNNING task that exceeds the budget FAILS with 'timed out'", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new OverrunningAgent(600);
    engine.registerAgent(agent);

    const task = engine.createTask("real timeout");
    const result = await engine.executeTask(task.id, agent.id, 200);
    expect(result.status).toBe("FAILED");
    expect(result.error).toMatch(/timed out/i);
  }, 15000);

  it("Path A: pause between iterations consumes ZERO budget — completion after a human wait far longer than the budget", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new SelfPausingTwiceAgent(engine);
    engine.registerAgent(agent);

    const task = engine.createTask("path a budget");
    const done = engine.executeTask(task.id, agent.id, 300);

    await waitForStatus(engine, task.id, "PAUSED", 2000);
    await sleep(800); // wait far longer than the 300ms budget while parked
    expect(engine.getTask(task.id)?.status).toBe("PAUSED"); // still parked, not timed out

    engine.resumeTask(task.id);
    const result = await done;
    expect(result.status).toBe("COMPLETED");
    expect(agent.actCalls).toBe(2);
  }, 15000);

  it("retry after timeout: re-executing a FAILED(timed out) task starts a fresh run and can complete", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new class implements Agent {
      id = "recover-after-timeout";
      name = "Recover After Timeout";
      public actCalls = 0;
      async observe(): Promise<string> { return "observe"; }
      async think(): Promise<string> { return "think"; }
      async act(): Promise<string> {
        this.actCalls += 1;
        if (this.actCalls === 1) { await sleep(600); return "DONE: too late"; }
        return "DONE: quick now";
      }
    }();
    engine.registerAgent(agent);

    const task = engine.createTask("retry after timeout");
    const first = await engine.executeTask(task.id, agent.id, 200);
    expect(first.status).toBe("FAILED");
    expect(first.error).toMatch(/timed out/i);

    const second = await engine.executeTask(task.id, agent.id, 5000);
    expect(second.status).toBe("COMPLETED");
    expect(second.result).toBe("quick now");
  }, 15000);
});

/** Pauses at the end of the first act (loop-top parking, Path A). */
class SelfPausingTwiceAgent implements Agent {
  id = "self-pausing-twice";
  name = "Self Pausing Twice";
  public actCalls = 0;
  constructor(private engine: TaskEngine) {}
  async observe(): Promise<string> { return "observe"; }
  async think(): Promise<string> { return "think"; }
  async act(task: Task): Promise<string> {
    this.actCalls += 1;
    if (this.actCalls === 1) {
      this.engine.pauseForApproval(task.id);
      return "PAUSED_FOR_APPROVAL: stage 1";
    }
    return "DONE: finalized";
  }
}
