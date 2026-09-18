import { describe, it, expect } from "vitest";
import { TaskEngine, InMemoryTaskStore } from "./engine.js";
import { Agent, Task, TaskExecution } from "./types.js";

/**
 * Regression tests for the approval-gate state-aliasing bug.
 *
 * Before the minimal core patch, an agent that paused its own task inside
 * `act()` was invisible to the execution loop (stale local Task reference),
 * causing the loop to re-run the agent instead of parking in
 * WAITING_APPROVAL. No RC1 test exercised pauseForApproval while a loop was
 * active — these tests close that gap.
 */

class SelfPausingAgent implements Agent {
  id = "self-pausing";
  name = "Self Pausing Agent";
  description = "pauses its own task during act and finalizes after approval";
  public actCalls = 0;

  async observe(): Promise<string> { return "observe"; }
  async think(): Promise<string> { return "think"; }

  async act(task: Task): Promise<string> {
    this.actCalls += 1;
    if (this.actCalls === 1) {
      // First pass: do the work, then park for approval.
      task.metadata = { ...task.metadata, draft: "ready" };
      (this.engine as TaskEngine).pauseForApproval(task.id);
      return "PAUSED_FOR_APPROVAL: draft";
    }
    // Second pass (after resume): finalize.
    return "DONE: finalized";
  }

  constructor(private engine: TaskEngine) {}
}

describe("TaskEngine approval gate (regression)", () => {
  it("parks a running task in PAUSED/WAITING_APPROVAL when the agent pauses itself, then resumes to completion", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new SelfPausingAgent(engine);
    engine.registerAgent(agent);

    const task = engine.createTask("needs approval");
    const executionPromise = engine.executeTask(task.id, agent.id, 5000);

    // Wait until the agent parks the task.
    for (let i = 0; i < 200; i++) {
      const t = engine.getTask(task.id);
      if (t?.status === "PAUSED") break;
      await new Promise(r => setTimeout(r, 10));
    }
    const parked = engine.getTask(task.id);
    expect(parked?.status).toBe("PAUSED");

    // The loop must NOT have re-run act while waiting for the human.
    expect(agent.actCalls).toBe(1);

    engine.resumeTask(task.id);
    const done = await executionPromise;
    expect(done.status).toBe("COMPLETED");
    expect(done.result).toBe("finalized");
    expect(agent.actCalls).toBe(2);
  }, 10000);

  it("rejectTask fails the parked task with an explicit REJECTED error", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new SelfPausingAgent(engine);
    engine.registerAgent(agent);

    const task = engine.createTask("needs approval");
    const executionPromise = engine.executeTask(task.id, agent.id, 5000);

    for (let i = 0; i < 200; i++) {
      const t = engine.getTask(task.id);
      if (t?.status === "PAUSED") break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect(agent.actCalls).toBe(1);

    engine.rejectTask(task.id, "human said no");
    const done = await executionPromise;
    expect(done.status).toBe("FAILED");
    expect(done.error).toMatch(/REJECTED: human said no/);
  }, 10000);
});

// ============================================================================
// APPROVAL-GATE HARDENING (bug A + bug B regression suite)
//
// Guarantees under test (Store = authoritative state):
//   - PAUSED does not become RUNNING (except via resumeTask)
//   - WAITING_APPROVAL does not become COMPLETED
//   - REJECTED never executes again on its own
//   - CANCELLED does not continue execution
//
// All tests use deferred promises instead of sleeps for deterministic
// interleaving of external pause/cancel with agent/verifier execution.
// ============================================================================

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((r) => { release = r; });
  return { promise, release };
}

/** Simple agent (execute-only) whose first execution blocks on a test gate. */
class GatedSimpleAgent implements Agent {
  id = "gated-simple";
  name = "Gated Simple Agent";
  description = "simple agent: first execute blocks until the test releases it";
  public executeCalls = 0;
  private gate: Promise<void> | null;

  constructor(gate: Promise<void> | null) {
    this.gate = gate;
  }

  async execute(task: Task): Promise<string> {
    this.executeCalls++;
    if (this.executeCalls === 1 && this.gate) {
      await this.gate;
    }
    return this.executeCalls === 1 ? "DONE: first pass" : "DONE: finalized after approval";
  }
}

/** OOTA agent whose first act blocks on a test gate (via the verifier wait). */
class GatedOotaAgent implements Agent {
  id = "gated-oota";
  name = "Gated OOTA Agent";
  description = "OOTA agent used with a gated flaky verifier";
  public actCalls = 0;

  async observe(): Promise<string> { return "observe"; }
  async think(): Promise<string> { return "think"; }
  async act(): Promise<string> {
    this.actCalls++;
    return this.actCalls === 1 ? "DONE: draft" : "DONE: finalized after approval";
  }
}

describe("TaskEngine approval gate (hardening regressions)", () => {
  it("bug A: simple execute + external pause -> stays PAUSED, WAITING_APPROVAL never becomes COMPLETED, resume completes", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const gate = deferred();
    const agent = new GatedSimpleAgent(gate.promise);
    engine.registerAgent(agent);

    const task = engine.createTask("simple pause");
    const executionPromise = engine.executeTask(task.id, agent.id, 10000);
    await new Promise(r => setTimeout(r, 20)); // let the loop enter execute #1
    expect(agent.executeCalls).toBe(1);

    engine.pauseForApproval(task.id); // external human pause mid-execute
    expect(engine.getTask(task.id)?.status).toBe("PAUSED");

    gate.release(); // the in-flight action finishes...
    const parked = await executionPromise;
    // ...but the result must NOT override the approval gate.
    expect(parked.status).toBe("PAUSED");
    expect(engine.getTask(task.id)?.status).toBe("PAUSED"); // PAUSED did not become RUNNING/COMPLETED
    expect(agent.executeCalls).toBe(1); // no new execution while paused

    engine.resumeTask(task.id);
    for (let i = 0; i < 200; i++) {
      if (engine.getTask(task.id)?.status === "COMPLETED") break;
      await new Promise(r => setTimeout(r, 10));
    }
    const finished = engine.getTask(task.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(agent.executeCalls).toBe(2);
  }, 15000);

  it("bug A: simple execute + external cancel -> CANCELLED does not continue execution", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const gate = deferred();
    const agent = new GatedSimpleAgent(gate.promise);
    engine.registerAgent(agent);

    const task = engine.createTask("simple cancel");
    const executionPromise = engine.executeTask(task.id, agent.id, 10000);
    await new Promise(r => setTimeout(r, 20));
    expect(agent.executeCalls).toBe(1);

    engine.cancelTask(task.id);
    expect(engine.getTask(task.id)?.status).toBe("CANCELLED");

    gate.release();
    const done = await executionPromise;
    expect(done.status).toBe("CANCELLED"); // never completed over the cancellation

    // Give any (wrong) lingering loop a chance to re-execute.
    await new Promise(r => setTimeout(r, 50));
    expect(agent.executeCalls).toBe(1);
    expect(engine.getTask(task.id)?.status).toBe("CANCELLED");
  }, 15000);

  it("bug B: retry + concurrent pause (simple path) -> PAUSED does not become RUNNING, no re-execution before approval", async () => {
    let verifyCalls = 0;
    const flakyVerifier = {
      verify: async () => {
        verifyCalls++;
        return verifyCalls === 1
          ? { passed: false as boolean, reason: "draft not verified" }
          : { passed: true as boolean, reason: "ok" };
      },
    };
    const engine = new TaskEngine(new InMemoryTaskStore(), { verifier: flakyVerifier as any });
    // Agent pauses itself on pass #1 and returns a non-final result; the old
    // bug let the retry bookkeeping clobber PAUSED back to RUNNING and run
    // pass #2 without approval.
    class PausingSimpleAgent implements Agent {
      id = "pausing-simple";
      name = "Pausing Simple Agent";
      description = "pauses itself on first execute";
      public executeCalls = 0;
      async execute(task: Task): Promise<string> {
        this.executeCalls++;
        if (this.executeCalls === 1) {
          (engine as TaskEngine).pauseForApproval(task.id);
          return "partial result";
        }
        return "DONE: finalized after approval";
      }
    }
    const agent = new PausingSimpleAgent();
    engine.registerAgent(agent);

    const task = engine.createTask("retry pause", undefined, { maxRetries: 3 });
    await engine.executeTask(task.id, agent.id, 10000);

    // Old bug: store flipped back to RUNNING and execute ran again -> COMPLETED.
    expect(engine.getTask(task.id)?.status).toBe("PAUSED");
    expect(agent.executeCalls).toBe(1);
    expect(verifyCalls).toBe(0); // verification never ran over a paused task

    engine.resumeTask(task.id);
    for (let i = 0; i < 200; i++) {
      if (engine.getTask(task.id)?.status === "COMPLETED") break;
      await new Promise(r => setTimeout(r, 10));
    }
    const finished = engine.getTask(task.id)!;
    expect(finished.status).toBe("COMPLETED");
    // After approval: verify #1 fails (flaky policy) -> ONE legitimate retry
    // (its own maxRetries policy) -> verify #2 passes. No execution happened
    // before approval (executeCalls was 1 while parked).
    expect(agent.executeCalls).toBe(3);
    expect(verifyCalls).toBe(2);
  }, 15000);

  it("bug B: retry + approval state (OOTA path) -> pause during verification is respected across the retry boundary", async () => {
    const gate = deferred();
    let verifyCalls = 0;
    const gatedFlakyVerifier = {
      verify: async () => {
        verifyCalls++;
        if (verifyCalls === 1) {
          await gate.promise; // external pause lands while verification is in flight
          return { passed: false as boolean, reason: "draft not verified" };
        }
        return { passed: true as boolean, reason: "ok" };
      },
    };
    const engine = new TaskEngine(new InMemoryTaskStore(), { verifier: gatedFlakyVerifier as any });
    const agent = new GatedOotaAgent();
    engine.registerAgent(agent);

    const task = engine.createTask("oota retry pause", undefined, { maxRetries: 3 });
    const executionPromise = engine.executeTask(task.id, agent.id, 10000);
    for (let i = 0; i < 200; i++) {
      if (verifyCalls === 1) break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect(agent.actCalls).toBe(1);

    engine.pauseForApproval(task.id);
    gate.release(); // verification now FAILS -> retry path must not clobber PAUSED

    // Deterministic marker: the retry bookkeeping ran (currentRetries=1)
    // WITHOUT overriding the authoritative PAUSED status.
    for (let i = 0; i < 200; i++) {
      const t = engine.getTask(task.id);
      if ((t?.metadata as any)?.currentRetries === 1) break;
      await new Promise(r => setTimeout(r, 10));
    }
    // THE bug B assertion: the retry save must NOT have flipped PAUSED->RUNNING.
    expect(engine.getTask(task.id)?.status).toBe("PAUSED");
    expect(agent.actCalls).toBe(1); // no re-execution while paused

    // The loop is parked (its promise only resolves after resume).
    engine.resumeTask(task.id);
    const done = await executionPromise;
    expect(done.status).toBe("COMPLETED");
    expect(agent.actCalls).toBe(2);
    expect(verifyCalls).toBe(2);
  }, 15000);

  it("resume after approval completes the task exactly once (double-resume is a no-op)", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new SelfPausingAgent(engine);
    engine.registerAgent(agent);

    const task = engine.createTask("single resume");
    const executionPromise = engine.executeTask(task.id, agent.id, 10000);
    for (let i = 0; i < 200; i++) {
      if (engine.getTask(task.id)?.status === "PAUSED") break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect(agent.actCalls).toBe(1);

    engine.resumeTask(task.id);
    engine.resumeTask(task.id); // duplicate resume must not spawn a second loop
    const done = await executionPromise;
    expect(done.status).toBe("COMPLETED");
    expect(agent.actCalls).toBe(2);
  }, 15000);

  it("REJECTED never executes again on its own", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const agent = new SelfPausingAgent(engine);
    engine.registerAgent(agent);

    const task = engine.createTask("reject freeze");
    const executionPromise = engine.executeTask(task.id, agent.id, 10000);
    for (let i = 0; i < 200; i++) {
      if (engine.getTask(task.id)?.status === "PAUSED") break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect(agent.actCalls).toBe(1);

    engine.rejectTask(task.id, "policy violation");
    const done = await executionPromise;
    expect(done.status).toBe("FAILED");
    expect(done.error).toMatch(/REJECTED: policy violation/);

    // A rejected task must not resume or re-execute by itself.
    engine.resumeTask(task.id); // no-op: status is FAILED, not PAUSED
    await new Promise(r => setTimeout(r, 50));
    expect(agent.actCalls).toBe(1);
    expect(engine.getTask(task.id)?.status).toBe("FAILED");
    // NOTE: explicit re-execution via executeTask() remains possible (retry
    // semantics for failed tasks) — that is a deliberate human action, not an
    // autonomous bypass. Autonomous paths (loop/resume) stay frozen.
  }, 15000);

  it("OOTA: pause landing during a PASSING verification is respected — WAITING_APPROVAL never becomes COMPLETED", async () => {
    const gate = deferred();
    let verifyCalls = 0;
    const gatedPassingVerifier = {
      verify: async () => {
        verifyCalls++;
        await gate.promise; // pause lands while verification is in flight
        return { passed: true as boolean, reason: "ok" };
      },
    };
    const engine = new TaskEngine(new InMemoryTaskStore(), { verifier: gatedPassingVerifier as any });
    const agent = new GatedOotaAgent();
    engine.registerAgent(agent);

    const task = engine.createTask("oota pause during passing verify");
    const executionPromise = engine.executeTask(task.id, agent.id, 10000);
    for (let i = 0; i < 200; i++) {
      if (verifyCalls === 1) break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect(agent.actCalls).toBe(1);

    engine.pauseForApproval(task.id);
    gate.release(); // verification PASSES — but the gate came first

    const parked = await executionPromise;
    expect(parked.status).toBe("PAUSED");
    expect(engine.getTask(task.id)?.status).toBe("PAUSED");
    expect(agent.actCalls).toBe(1);

    engine.resumeTask(task.id);
    for (let i = 0; i < 200; i++) {
      if (engine.getTask(task.id)?.status === "COMPLETED") break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect(engine.getTask(task.id)?.status).toBe("COMPLETED");
    expect(agent.actCalls).toBe(2);
  }, 15000);
});
