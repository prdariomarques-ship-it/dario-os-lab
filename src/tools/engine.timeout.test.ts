import { describe, expect, it } from "vitest";
import { SimpleToolEngine } from "./engine.js";
import type { Tool } from "./types.js";
import { TaskEngine, InMemoryTaskStore } from "../core/engine.js";

/**
 * RC2 HARDENING B6 — REAL TOOL TIMEOUT (FINAL GATE §8)
 *
 * Defect: SimpleToolEngine.executeTool awaited tool.execute() with no budget.
 * A tool whose promise never settles (hung socket, forgotten await, deadlock)
 * wedged the agent loop forever: the task-level budget could fail the task,
 * but the in-flight execution was never reclaimable and no per-tool error
 * was ever produced.
 *
 * Contract now enforced:
 *   1. tool that never resolves + positive timeoutMs  -> rejects with
 *      `timed out` error within the budget (never stuck);
 *   2. normal tools with a generous timeoutMs are unaffected;
 *   3. invalid timeoutMs (0 / negative / NaN) falls back to legacy behavior
 *      (no per-tool timeout) — documented backward compatibility;
 *   4. engine-level integration: a hung tool inside an agent act fails the
 *      task with the tool timeout error instead of hanging executeTask.
 */

function hangTool(name: string, timeoutMs: number | undefined): Tool {
  return {
    name,
    description: "tool whose promise never settles",
    risk: "LOW",
    schema: { type: "object" },
    timeoutMs,
    execute: () => new Promise<string | Record<string, unknown>>(() => {}),
  };
}

describe("RC2 hardening B6: real per-tool timeout", () => {
  it("a tool that never resolves rejects with 'timed out' inside its budget (never stuck)", async () => {
    const engine = new SimpleToolEngine();
    engine.register(hangTool("hang", 60));

    const started = Date.now();
    await expect(engine.executeTool("hang", {})).rejects.toThrow(/timed out after 60ms/);
    const elapsed = Date.now() - started;
    // Proves the engine enforced the budget instead of awaiting forever.
    expect(elapsed).toBeLessThan(2000);
  });

  it("does not turn a fast tool with a generous timeout into a failure", async () => {
    const engine = new SimpleToolEngine();
    engine.register({
      name: "fast",
      description: "fast tool under a generous budget",
      risk: "LOW",
      schema: { type: "object" },
      timeoutMs: 5000,
      execute: async () => "ok",
    });

    await expect(engine.executeTool("fast", {})).resolves.toBe("ok");
  });

  it("keeps the process healthy after a timed-out tool (late rejection is muted)", async () => {
    const engine = new SimpleToolEngine();
    let rejectLate!: (e: Error) => void;
    engine.register({
      name: "late-boom",
      description: "rejects long after the budget fired",
      risk: "LOW",
      schema: { type: "object" },
      timeoutMs: 30,
      execute: () =>
        new Promise<string | Record<string, unknown>>((_, reject) => {
          rejectLate = reject;
        }),
    });

    await expect(engine.executeTool("late-boom", {})).rejects.toThrow(/timed out after 30ms/);

    // The muted late rejection must not crash the process (unhandled rejection).
    rejectLate(new Error("too late to matter"));
    await new Promise((r) => setTimeout(r, 20));
    expect(true).toBe(true);
  });

  it.each([0, -5, Number.NaN])(
    "invalid timeoutMs (%s) falls back to legacy behavior (slow tool still completes)",
    async (bad) => {
      const engine = new SimpleToolEngine();
      engine.register({
        name: `slow-${String(bad)}`,
        description: "slow but legitimate tool, no valid budget declared",
        risk: "LOW",
        schema: { type: "object" },
        timeoutMs: bad,
        execute: async () => {
          await new Promise((r) => setTimeout(r, 60));
          return "done-legacy";
        },
      });

      await expect(engine.executeTool(`slow-${String(bad)}`, {})).resolves.toBe("done-legacy");
    }
  );

  it("engine-level integration: hung tool inside an agent act FAILS the task with the tool timeout error", async () => {
    const tools = new SimpleToolEngine();
    tools.register(hangTool("never-returns", 50));

    const engine = new TaskEngine(new InMemoryTaskStore());
    const task = engine.createTask("use a hung tool");
    engine.registerAgent({
      id: "hung-tool-agent",
      name: "Hung",
      execute: async () => {
        // Simulates the agent protocol calling a tool that never settles.
        await tools.executeTool("never-returns", {});
        return "DONE:unreachable";
      },
    });

    await engine.executeTask(task.id, "hung-tool-agent", 30000);

    const final = engine.getTask(task.id)!;
    expect(final.status).toBe("FAILED");
    expect(final.error).toContain("timed out after 50ms");
  });
});
