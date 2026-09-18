import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { TaskEngine } from "./engine.js";
import { TaskScheduler } from "./scheduler.js";

describe("TaskScheduler", () => {
  let engine: any;
  let scheduler: TaskScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = {
      createTask: vi.fn().mockReturnValue({ id: "t1" }),
      executeTask: vi.fn().mockResolvedValue({})
    };
    scheduler = new TaskScheduler(engine as any as TaskEngine);
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  it("should execute task on schedule", async () => {
    scheduler.schedule({
      id: "s1",
      objective: "Recurring job",
      agentId: "agent1",
      intervalMs: 5000
    });

    scheduler.start(1000);

    expect(engine.createTask).not.toHaveBeenCalled();

    // Advance 5s
    await vi.advanceTimersByTimeAsync(5000);

    expect(engine.createTask).toHaveBeenCalledTimes(1);
    expect(engine.executeTask).toHaveBeenCalledWith("t1", "agent1");

    // Advance another 5s
    await vi.advanceTimersByTimeAsync(5000);
    expect(engine.createTask).toHaveBeenCalledTimes(2);
  });
});
