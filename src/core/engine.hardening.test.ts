import { describe, expect, it } from "vitest";
import { InMemoryTaskStore, TaskEngine } from "./engine.js";
import type { Task } from "./types.js";

/**
 * RC2 HARDENING REGRESSIONS
 *
 * Covers three fixes found in the RC2 deep audit:
 *   1. failTask must never convert PAUSED into FAILED — the "PAUSED never
 *      becomes FAILED" invariant previously held only for the timer path;
 *      an agent exception racing a human pause could overwrite the gate.
 *   2. cancelTask now emits TASK_CANCELLED (it was the only terminal
 *      transition with no engine event).
 *   3. pauseForApproval/resumeTask/rejectTask fail loudly for unknown ids
 *      (consistent with cancelTask) while keeping the documented silent
 *      no-op for wrong-status ids.
 */

describe("RC2 hardening: approval gate vs internal failure", () => {
  it("keeps PAUSED (never FAILED) when the agent throws while a human pause is landing, and stays resumable", async () => {
    let healAct = false;
    let rejectExecution!: (e: Error) => void;
    const boom = new Promise<never>((_, reject) => {
      rejectExecution = reject;
    });

    const engine = new TaskEngine(new InMemoryTaskStore());
    const task = engine.createTask("race: internal error vs human pause");

    engine.registerAgent({
      id: "race-agent",
      name: "Race",
      observe: async () => "observed",
      think: async () => "plan",
      act: async (t: Task) => {
        if (healAct) return "DONE:recovered";
        // Human gate lands while the agent is mid-act...
        engine.pauseForApproval(t.id);
        // ...and the act then blows up (tool crash, provider timeout, etc.)
        rejectExecution(new Error("tool exploded mid-act"));
        await boom;
        return "DONE:unreachable";
      },
    });

    await engine.executeTask(task.id, "race-agent", 30000);

    const parked = engine.getTask(task.id)!;
    // INVARIANT: the human gate outranks the internal failure.
    expect(parked.status).toBe("PAUSED");
    expect(parked.error).toContain("tool exploded mid-act");

    // The execution must be resumable (resumeTask ignores DONE/ERROR
    // executions by design, so the ERROR step must not stick as state).
    const execs = engine["execStore"].getByTaskId(task.id);
    expect(execs[0].state).toBe("IDLE");
    expect(execs[0].history.some((s) => s.state === "ERROR" && s.error?.includes("tool exploded"))).toBe(true);

    // Approval retries the failed step cleanly and completes.
    healAct = true;
    engine.resumeTask(task.id);
    const deadline = Date.now() + 5000;
    while (engine.getTask(task.id)!.status !== "COMPLETED" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(engine.getTask(task.id)!.status).toBe("COMPLETED");
    expect(engine.getTask(task.id)!.result).toBe("recovered");
  });
});

describe("RC2 hardening: cancellation observability", () => {
  it("cancelTask emits TASK_CANCELLED to engine observers", () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const events: Array<{ type: string; taskId: string }> = [];
    engine.subscribe({ onEvent: (e) => events.push({ type: e.type, taskId: e.taskId }) });

    const task = engine.createTask("cancel me");
    engine.cancelTask(task.id);

    const cancelled = events.find((e) => e.type === "TASK_CANCELLED");
    expect(cancelled).toBeDefined();
    expect(cancelled!.taskId).toBe(task.id);
  });

  it("cancelTask still refuses terminal and unknown tasks", async () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    engine.registerAgent({ id: "a1", name: "A1", execute: async () => "DONE:done" });

    expect(() => engine.cancelTask("missing-id")).toThrow(/not found/);

    const t = engine.createTask("finish first");
    await engine.executeTask(t.id, "a1");
    expect(engine.getTask(t.id)!.status).toBe("COMPLETED");
    expect(() => engine.cancelTask(t.id)).toThrow(/already finished/);
  });
});

describe("RC2 hardening: cancel state matrix (FINAL GATE §6)", () => {
  it("cancels PENDING, RUNNING, PAUSED and waiting-approval tasks, each emitting exactly one TASK_CANCELLED", () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const events: Array<{ type: string; taskId: string }> = [];
    engine.subscribe({ onEvent: (e) => events.push({ type: e.type, taskId: e.taskId }) });

    // queued (PENDING / QUEUED)
    const queued = engine.createTask("cancel while queued");
    expect(engine.cancelTask(queued.id).status).toBe("CANCELLED");

    // running
    const running = engine.createTask("cancel while running");
    running.status = "RUNNING";
    expect(engine.cancelTask(running.id).status).toBe("CANCELLED");

    // paused
    const paused = engine.createTask("cancel while paused");
    paused.status = "PAUSED";
    expect(engine.cancelTask(paused.id).status).toBe("CANCELLED");

    // waiting approval (approval gate parks the task in PAUSED)
    const waiting = engine.createTask("cancel while waiting approval");
    waiting.status = "PAUSED";
    engine.pauseForApproval(waiting.id);
    expect(engine.cancelTask(waiting.id).status).toBe("CANCELLED");

    const cancels = events.filter((e) => e.type === "TASK_CANCELLED");
    expect(cancels.map((c) => c.taskId).sort()).toEqual(
      [queued.id, running.id, paused.id, waiting.id].sort()
    );
  });

  it("double cancel throws on the second call and emits NO additional TASK_CANCELLED", () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const events: Array<{ type: string }> = [];
    engine.subscribe({ onEvent: (e) => events.push({ type: e.type }) });

    const task = engine.createTask("cancel me once");
    engine.cancelTask(task.id);
    expect(engine.getTask(task.id)!.status).toBe("CANCELLED");

    expect(() => engine.cancelTask(task.id)).toThrow(/already finished/);

    expect(events.filter((e) => e.type === "TASK_CANCELLED")).toHaveLength(1);
  });
});

describe("RC2 hardening: unknown-id contract for the approval API", () => {
  it("pauseForApproval/resumeTask/rejectTask throw for unknown ids", () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    expect(() => engine.pauseForApproval("missing-id")).toThrow(/not found/);
    expect(() => engine.resumeTask("missing-id")).toThrow(/not found/);
    expect(() => engine.rejectTask("missing-id", "reason")).toThrow(/not found/);
  });

  it("wrong-status ids remain a silent no-op for pause/resume (documented gating)", () => {
    const engine = new TaskEngine(new InMemoryTaskStore());
    const t = engine.createTask("pending task");
    // PENDING: pause is only meaningful for RUNNING; resume only for PAUSED.
    expect(() => engine.pauseForApproval(t.id)).not.toThrow();
    expect(() => engine.resumeTask(t.id)).not.toThrow();
    expect(engine.getTask(t.id)!.status).toBe("PENDING");
  });
});
