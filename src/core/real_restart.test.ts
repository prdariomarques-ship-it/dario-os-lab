import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { SQLitePersistentStore } from "./sqlite.js";
import { TaskEngine } from "./engine.js";
import fsSync from "fs";

describe("REAL PROCESS RESTART", () => {
  const dbPath = "real-restart.db";

  afterEach(() => {
    try { fsSync.unlinkSync(dbPath); } catch (e) {}
  });

  beforeEach(() => {
    try { fsSync.unlinkSync(dbPath); } catch (e) {}
  });

  it("should survive actual store reconstruction representing process restart", async () => {
    // Process A
    let storeA = new SQLitePersistentStore(dbPath);
    let engineA = new TaskEngine(storeA);
    const taskA = engineA.createTask("Survive restart", "test context");

    taskA.status = "PAUSED"; // Hard lock to pause
    storeA.saveTask(taskA);
    storeA.close();

    // Process B (New instances, simulating separate process reading same file)
    let storeB = new SQLitePersistentStore(dbPath);
    let engineB = new TaskEngine(storeB);

    const taskB = storeB.getTask(taskA.id);
    expect(taskB).toBeDefined();
    expect(taskB?.status).toBe("PAUSED");
    expect(taskB?.objective).toBe("Survive restart");

    storeB.close();
  });
});
