import { describe, expect, it, beforeEach } from "vitest";
import { TaskEngine, InMemoryTaskStore } from "./engine.js";
import { Agent, Task, TaskExecution } from "./types.js";

describe("TaskEngine Loop Enhancements", () => {
  let engine: TaskEngine;
  let store: InMemoryTaskStore;

  const simpleAgent: Agent = {
    id: "simple-agent",
    name: "Simple Agent",
    execute: async (task: Task) => `Executed: ${task.objective}`,
  };

  const loopingAgent: Agent = {
    id: "loop-agent",
    name: "Looping Agent",
    observe: async () => "observed data",
    think: async () => "thought process",
    act: async (task: Task, context: TaskExecution) => {
      if (context.iterations === 2) {
        return "DONE: Final Answer";
      }
      return "acted on environment";
    }
  };

  const failingLoopAgent: Agent = {
    id: "fail-agent",
    name: "Failing Loop Agent",
    observe: async () => { throw new Error("observe failed"); },
  };

  const infiniteAgent: Agent = {
    id: "infinite-agent",
    name: "Infinite Agent",
    observe: async () => "obs",
    act: async () => "not done"
  };

  beforeEach(() => {
    store = new InMemoryTaskStore();
    engine = new TaskEngine(store, { maxIterations: 3 } as any);
    engine.registerAgent(simpleAgent);
    engine.registerAgent(loopingAgent);
    engine.registerAgent(failingLoopAgent);
    engine.registerAgent(infiniteAgent);
  });

  it("should execute a simple agent task", async () => {
    const task = engine.createTask("Test objective");
    const executedTask = await engine.executeTask(task.id, simpleAgent.id);
    expect(executedTask.status).toBe("COMPLETED");
    expect(executedTask.result).toBe("Executed: Test objective");
  });

  it("should execute a multi-step loop agent task", async () => {
    const task = engine.createTask("Loop objective");
    const executedTask = await engine.executeTask(task.id, loopingAgent.id);

    expect(executedTask.status).toBe("COMPLETED");
    expect(executedTask.result).toBe("Final Answer");
  });

  it("should handle failure within the loop", async () => {
    const task = engine.createTask("Fail objective");
    const executedTask = await engine.executeTask(task.id, failingLoopAgent.id);

    expect(executedTask.status).toBe("FAILED");
    expect(executedTask.error).toBe("observe failed");
  });

  it("should fail task if it exceeds max iterations", async () => {
    const task = engine.createTask("Infinite objective");
    const executedTask = await engine.executeTask(task.id, infiniteAgent.id);

    expect(executedTask.status).toBe("FAILED");
    expect(executedTask.error).toBe("Exceeded maximum iterations without completing");
  });

  it("should allow a human to reject a paused task", async () => {
    const task = engine.createTask("Reject Test");
    task.status = "PAUSED";
    store.saveTask(task);

    engine.rejectTask(task.id, "Not safe");

    const finishedTask = engine.getTask(task.id);
    expect(finishedTask?.status).toBe("FAILED");
    expect(finishedTask?.error).toBe("REJECTED: Not safe");
  });

  it("should throw error if rejecting a task that is not paused", () => {
    const task = engine.createTask("Reject Not Paused");
    expect(() => engine.rejectTask(task.id, "nope")).toThrowError(/Can only reject a task that is PAUSED/);
  });
});
