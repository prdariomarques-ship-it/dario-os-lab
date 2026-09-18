import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SQLitePersistentStore } from "./sqlite.js";
import { TaskEngine } from "./engine.js";
import { Agent, Task, TaskExecution } from "./types.js";
import fs from "fs";

describe("Persistent Agent Execution", () => {
  const dbPath = "test-persistence.db";

  beforeEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("should survive process crash and recover PAUSED task", async () => {
    const storeA = new SQLitePersistentStore(dbPath);
    const engineA = new TaskEngine(storeA);

    const task = engineA.createTask("Survive restart");
    task.status = "PAUSED";
    storeA.saveTask(task);

    storeA.saveExecution({
      id: "exec-1",
      taskId: task.id,
      agentId: "agent-crash",
      state: "WAITING_APPROVAL",
      iterations: 1,
      maxIterations: 10,
      history: [{ state: "OBSERVE", timestamp: new Date() }, { state: "WAITING_APPROVAL", timestamp: new Date() }],
      startedAt: new Date(),
      updatedAt: new Date()
    });

    // Close store
    storeA.close();

    // 3. Start Engine B (simulates process restart)
    const storeB = new SQLitePersistentStore(dbPath);
    const engineB = new TaskEngine(storeB);

    const agentB: Agent = {
      id: "agent-crash", // same ID
      name: "Crash Agent Resumed",
      observe: async () => "obs B",
      think: async () => "think B",
      act: async () => "DONE: Recovered Successfully"
    };
    engineB.registerAgent(agentB);

    // Verify task is loaded and PAUSED from DB
    const loadedTask = engineB.getTask(task.id);
    expect(loadedTask).toBeDefined();
    expect(loadedTask?.status).toBe("PAUSED");

    const execs = storeB.getByTaskId(task.id);
    expect(execs.length).toBeGreaterThan(0);

    // 4. Resume via Engine B
    // Instead of directly calling recoverAndResume while PAUSED, a human triggers resumeTask()
    engineB.resumeTask(task.id);
    // Because resumeTask() spawns the runExecutionLoop independently now, we must poll for completion

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (storeB.getTask(task.id)?.status === "COMPLETED") {
          clearInterval(check);
          resolve();
        }
      }, 5);
    });

    const finishedTask = storeB.getTask(task.id);
    expect(finishedTask?.status).toBe("COMPLETED");
    expect(finishedTask?.result).toBe("Recovered Successfully");

    storeB.close();
  });

  it("should detect idempotency boundary and not double-execute ACT if crashed after ACT", async () => {
    const storeA = new SQLitePersistentStore(dbPath);
    const engineA = new TaskEngine(storeA);

    const task = engineA.createTask("Idempotency test");
    task.status = "RUNNING";
    storeA.saveTask(task);

    // Simulate crash after ACT but before DONE
    storeA.saveExecution({
      id: "exec-idemp",
      taskId: task.id,
      agentId: "agent-idemp",
      state: "ACT", // Stuck in ACT
      iterations: 1,
      maxIterations: 10,
      history: [{ state: "OBSERVE", timestamp: new Date() }, { state: "THINK", timestamp: new Date() }, { state: "ACT", timestamp: new Date() }],
      startedAt: new Date(),
      updatedAt: new Date()
    });

    storeA.close();

    const storeB = new SQLitePersistentStore(dbPath);
    const engineB = new TaskEngine(storeB);

    let actCalled = false;
    const agentB: Agent = {
      id: "agent-idemp",
      name: "Idemp Agent",
      act: async () => { actCalled = true; return "DONE: Bad"; }
    };
    engineB.registerAgent(agentB);

    const execPromiseB = engineB.recoverAndResume(task.id);
    const finishedTask = await execPromiseB;

    // Engine should detect crash during ACT and require approval / fail safely to prevent double-execution
    expect(finishedTask.status).toBe("FAILED");
    expect(finishedTask.error).toMatch(/ambiguous state|interrupted during ACT/i);
    expect(actCalled).toBe(false);

    storeB.close();
  });
});
