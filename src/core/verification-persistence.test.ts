import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SQLitePersistentStore } from "./sqlite.js";
import { TaskEngine } from "./engine.js";
import { Agent, Task } from "./types.js";
import { DeterministicVerificationEngine } from "../verification/engine.js";
import fs from "fs";

describe("Verification Persistence Flow", () => {
  const dbPath = "test-verify-persist.db";

  beforeEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("TEST 5 - PERSISTENCE: should survive crash during VERIFY", async () => {
    const storeA = new SQLitePersistentStore(dbPath);
    const verifier = new DeterministicVerificationEngine();

    // We register a custom verifier that simulates a crash by never resolving
    let verifyHit = false;
    let verifyResolver: () => void;
    const verifyPromise = new Promise<void>(r => { verifyResolver = r; });

    verifier.registerCustomVerifier("crash_verifier", async () => {
      verifyHit = true;
      verifyResolver();
      // Hang indefinitely simulating process death during verification
      await new Promise(() => {});
      return { passed: true };
    });

    const engineA = new TaskEngine(storeA, { maxIterations: 5, verifier });

    const agentA: Agent = {
      id: "agent-verify",
      name: "Agent",
      act: async () => "DONE: Work complete"
    };
    engineA.registerAgent(agentA);

    const task = engineA.createTask("Verification test", undefined, {
      verification: { type: "CUSTOM", customVerifierId: "crash_verifier", value: null }
    });

    // Do not await
    engineA.executeTask(task.id, agentA.id, 60000);

    // Wait until it reaches the VERIFY phase and hangs
    await verifyPromise;
    await new Promise(r => setTimeout(r, 100)); // allow store save

    storeA.close(); // Crash

    // Restart process
    const storeB = new SQLitePersistentStore(dbPath);

    // Check state: it should be in VERIFY
    const execs = storeB.getByTaskId(task.id);
    expect(execs.length).toBeGreaterThan(0);
    const lastState = execs[0].history[execs[0].history.length - 1].state;
    expect(lastState).toBe("VERIFY");

    // Wire a new engine that has a working verifier (recovery)
    const newVerifier = new DeterministicVerificationEngine();
    newVerifier.registerCustomVerifier("crash_verifier", async () => ({ passed: false, reason: "Recovered and rejected" }));
    const engineB = new TaskEngine(storeB, { maxIterations: 5, verifier: newVerifier });

    const agentB: Agent = {
      id: "agent-verify",
      name: "Agent",
      act: async () => "DONE: Try 2"
    };
    engineB.registerAgent(agentB);

    // Because it crashed in VERIFY, recovery should consider it interrupted in the loop
    // Currently, our recovery logic rewinds to OBSERVE safely.
    const execPromiseB = engineB.recoverAndResume(task.id);
    const finishedTask = await execPromiseB;

    expect(finishedTask.status).toBe("FAILED");
    expect(finishedTask.error).toContain("Recovered and rejected");

    storeB.close();
  });
});
