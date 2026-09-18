import { describe, expect, it, beforeEach } from "vitest";
import { TaskEngine } from "./engine.js";
import { AutonomousAgent } from "./agent.js";
import { SupervisorAgent } from "./multiagent.js";
import { SQLitePersistentStore } from "./sqlite.js";
import { SimpleContextEngine } from "../context/engine.js";
import { SimpleModelRouter } from "../model/router.js";
import { InMemoryMemoryStore } from "../memory/engine.js";

describe("MultiAgent Supervisor", () => {
  let engine: TaskEngine;
  let supervisor: SupervisorAgent;

  beforeEach(() => {
    const store = new SQLitePersistentStore(":memory:");
    engine = new TaskEngine(store);
    const router = new SimpleModelRouter() as any;
    const ctx = new SimpleContextEngine(new InMemoryMemoryStore());

    const agentA = new AutonomousAgent("a", "Coder", ctx, router);
    agentA.description = "code";
    const agentB = new AutonomousAgent("b", "Researcher", ctx, router);
    agentB.description = "research";

    engine.registerAgent(agentA);
    engine.registerAgent(agentB);

    supervisor = new SupervisorAgent("sup1", engine, [agentA, agentB]);
  });

  it("should select the agent based on description and create a task", async () => {
    // Because we haven't mocked the agent act properly, it'll try to hit router. We just mock executeTask on engine
    engine.executeTask = async (taskId, agentId) => {
      const task = engine["taskStore"].getTask(taskId)!;
      task.agentId = agentId;
      task.status = "COMPLETED";
      return task;
    };

    const task1 = await supervisor.delegateTask("Write some code");
    expect(task1.agentId).toBe("a");

    const task2 = await supervisor.delegateTask("Do some research");
    expect(task2.agentId).toBe("b");
  });
});
