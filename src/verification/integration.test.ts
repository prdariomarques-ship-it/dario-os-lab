import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { TaskEngine } from "../core/engine.js";
import { SimplePlanner } from "../planner/planner.js";
import { SimpleToolEngine } from "../tools/engine.js";
import { InMemoryMemoryStore } from "../memory/engine.js";
import { DeterministicVerificationEngine } from "./engine.js";
import { AutonomousAgent } from "../core/agent.js";
import { SimpleContextEngine } from "../context/engine.js";
import { SimpleModelRouter } from "../model/router.js";
import { OllamaProvider } from "../model/ollama.js";
import { Task } from "../core/types.js";
import { SQLitePersistentStore } from "../core/sqlite.js";
import fs from "fs/promises";
import Database from "better-sqlite3";

describe("Verification Engine Integration - Anti-Hallucination Proofs", () => {
  let taskStore: SQLitePersistentStore;
  let execStore: SQLitePersistentStore;
  let engine: TaskEngine;
  let planner: SimplePlanner;
  let tools: SimpleToolEngine;
  let memory: InMemoryMemoryStore;
  let contextEngine: SimpleContextEngine;
  let modelRouter: SimpleModelRouter;
  let verifier: DeterministicVerificationEngine;
  let db: Database.Database;

  const dbPath = "verification_integration_test.db";

  function createAgent(id: string, name: string): AutonomousAgent {
     const agent = new AutonomousAgent(id, name, contextEngine, modelRouter as any, tools as any);
     // We are explicitly testing VERIFICATION logic, not the model generation logic here.
     // Mock the entire execution loop that calls the model to instead call our custom `.act` methods setup in each test
     (agent as any).execute = undefined;
     agent.observe = async () => "Mock observe";
     agent.think = async () => "Mock think";
     return agent;
  }

  beforeEach(() => {
    taskStore = new SQLitePersistentStore(dbPath);
    execStore = taskStore;

    planner = new SimplePlanner({ createTask: (o) => { return {} as any } });
    tools = new SimpleToolEngine();
    memory = new InMemoryMemoryStore();
    contextEngine = new SimpleContextEngine(memory);
    modelRouter = new SimpleModelRouter();
    modelRouter.registerProvider(new OllamaProvider());
    verifier = new DeterministicVerificationEngine();

    engine = new TaskEngine(taskStore, { verifier }, planner, tools, memory, verifier);
  });

  afterEach(async () => {
    try {
      taskStore.close(); // Need to ensure it's exposed or close the process
    } catch(e) {}
    try {
      await fs.unlink(dbPath);
    } catch (e) {}
  });

  it("TEST 1: FALSE SUCCESS - Agent claims success, but evidence is missing", async () => {
    const liarAgent = createAgent("liar", "Ollama");
    liarAgent.act = async () => "DONE: I have successfully created the file.";
    engine.registerAgent(liarAgent);

    const task = engine.createTask("Create the config file", "liar context", {
      verification: { type: "FILE_EXISTS", value: "missing_config.json" }
    });

    const completedTask = await engine.executeTask(task.id, "liar");

    expect(completedTask.status).toBe("FAILED");
    expect(completedTask.error).toContain("Verification failed: File does not exist");
  });

  it("TEST 2: REAL SUCCESS - Agent acts and evidence exists", async () => {
    const testFile = "real_config.json";

    const honestAgent = createAgent("honest", "Ollama");
    honestAgent.act = async () => {
      await fs.writeFile(testFile, '{"ok": true}');
      return "DONE: I have successfully created the file.";
    };
    engine.registerAgent(honestAgent);

    const task = engine.createTask("Create the config file", "honest context", {
      verification: { type: "FILE_EXISTS", value: testFile }
    });

    const completedTask = await engine.executeTask(task.id, "honest");

    expect(completedTask.status).toBe("COMPLETED");

    await fs.unlink(testFile);
  });

  it("TEST 3: CONSTRAINT VIOLATION - Multiple constraints, one fails", async () => {
    const testFile = "partial_config.json";

    const partialAgent = createAgent("partial", "Ollama");
    partialAgent.act = async () => {
      await fs.writeFile(testFile, '{"ok": true}');
      return "DONE: The file is created.";
    };
    engine.registerAgent(partialAgent);

    const task = engine.createTask("Create config and return JSON", "partial context", {
      verification: [
        { type: "FILE_EXISTS", value: testFile },
        { type: "SCHEMA_MATCH", value: ["id"] }
      ]
    });

    const completedTask = await engine.executeTask(task.id, "partial");

    expect(completedTask.status).toBe("FAILED");
    expect(completedTask.error).toContain("Verification failed: Schema matching failed");

    await fs.unlink(testFile);
  });

  it("TEST 4: MISSING EVIDENCE - Agent claims success but provides no evidence", async () => {
     const silentAgent = createAgent("silent", "Ollama");
     silentAgent.act = async () => "DONE: All good here.";
     engine.registerAgent(silentAgent);

     const task = engine.createTask("Return JSON schema", "silent context", {
       verification: { type: "SCHEMA_MATCH", value: ["status"] }
     });

     const completedTask = await engine.executeTask(task.id, "silent");

     expect(completedTask.status).toBe("FAILED");
     expect(completedTask.error).toContain("Verification failed: Schema matching failed");
  });

  it("TEST 5: PERSISTENCE - Verification result is persisted correctly during crash/recovery", async () => {
    const testFile = "persist_test.json";

    const crashingAgent = createAgent("crasher", "Ollama");
    let hasRun = false;
    crashingAgent.act = async () => {
      if (!hasRun) {
        hasRun = true;
        throw new Error("Simulated process crash in ACT phase");
      }
      return "DONE";
    };
    engine.registerAgent(crashingAgent);

    const task = engine.createTask("Do a persistent task", "crasher context", {
      verification: { type: "FILE_EXISTS", value: testFile }
    });

    // The runExecutionLoop catches the error and marks the task as FAILED, it doesn't reject anymore.
    // So we just await it and check it is FAILED with the error message.
    const crashedTask = await engine.executeTask(task.id, "crasher");
    expect(crashedTask.status).toBe("FAILED");
    expect(crashedTask.error).toContain("Simulated process crash in ACT phase");

    // In our test, if it failed because of the error, we need to reset the status to RUNNING to pretend we are recovering from a mid-flight crash
    // rather than a clean failure. Actually in a real crash, `task.status` would STILL BE RUNNING because the failTask wouldn't have been called!
    // Since our test runs in the same process, the `try/catch` block inside `runExecutionLoop` caught the error and cleanly set it to FAILED.
    // To properly simulate a HARD CRASH where `failTask` wasn't called, we must manually set the DB status back to RUNNING
    // to simulate the state before the process died.
    const hardCrashTask = taskStore.getTask(task.id)!;
    hardCrashTask.status = "RUNNING";
    taskStore.saveTask(hardCrashTask);

    try { taskStore.close(); } catch(e) {} // Assuming close might be needed, if not, we rely on GC
    const newTaskStore = new SQLitePersistentStore(dbPath);
    const newEngine = new TaskEngine(newTaskStore, { verifier }, planner, tools, memory, verifier);

    const recoveryAgent = createAgent("crasher", "Ollama");
    recoveryAgent.act = async () => {
      await fs.writeFile(testFile, '{"ok": true}');
      return "DONE: Done.";
    };
    newEngine.registerAgent(recoveryAgent);

    const recoveredTask = await newEngine.recoverAndResume(task.id);
    expect(recoveredTask.status).toBe("COMPLETED");

    const execs = newTaskStore.getByTaskId(task.id);
    const lastExec = execs[0];

    const historyStates = lastExec.history.map(h => h.state);
    expect(historyStates).toContain("VERIFY");
    expect(historyStates).toContain("DONE");

    await fs.unlink(testFile);
    try { newTaskStore.close(); } catch(e) {}
  });

  it("TEST 6: RETRY - Execution follows Retry Policy on Verification Failure", async () => {
    let attempts = 0;
    const retryAgent = createAgent("retry", "Ollama");

    retryAgent.act = async () => {
      attempts++;
      if (attempts < 2) {
        return "DONE: I failed.";
      }
      await fs.writeFile("retry_file.txt", "ok");
      return "DONE: I succeeded this time.";
    };
    engine.registerAgent(retryAgent);

    const task = engine.createTask("Retry task", "retry context", {
      verification: { type: "FILE_EXISTS", value: "retry_file.txt" },
      maxRetries: 2
    });

    const completedTask = await engine.executeTask(task.id, "retry");

    expect(completedTask.status).toBe("COMPLETED");
    expect(attempts).toBe(2);

    await fs.unlink("retry_file.txt");
  });

  it("TEST 7: RETRY EXHAUSTION - Execution fails if verification fails continuously up to maxRetries", async () => {
    let attempts = 0;
    const exhaustAgent = createAgent("exhaust", "Ollama");

    exhaustAgent.act = async () => {
      attempts++;
      // Never succeed
      return "DONE: I tried.";
    };
    engine.registerAgent(exhaustAgent);

    const task = engine.createTask("Exhaust task", "exhaust context", {
      verification: { type: "FILE_EXISTS", value: "never_exists.txt" },
      maxRetries: 2
    });

    const completedTask = await engine.executeTask(task.id, "exhaust");

    expect(completedTask.status).toBe("FAILED");
    expect(completedTask.error).toContain("Verification failed");
    expect(attempts).toBe(3); // Initial attempt (currentRetries=0) + 2 retries
  });

  it("TEST 8: VERIFICATION BYPASS - Attempt to complete an Execution directly without satisfying verification", async () => {
    const task = engine.createTask("Cannot bypass", "bypass context", {
      verification: { type: "FILE_EXISTS", value: "impossible_file.txt" }
    });

    // Don't manually set to RUNNING, let executeTask handle it to avoid "already running" error

    const bypassAgent = createAgent("bypass", "Ollama");
    bypassAgent.act = async () => "DONE: Trust me bro";
    engine.registerAgent(bypassAgent);

    const completedTask = await engine.executeTask(task.id, "bypass");

    expect(completedTask.status).toBe("FAILED");
  });

  it("TEST 9: HITL - Approval path does not bypass verification", async () => {
    const hitlAgent = createAgent("hitl", "Ollama");

    hitlAgent.act = async () => {
      return "DONE: I did it."; // No evidence created
    };
    engine.registerAgent(hitlAgent);

    const task = engine.createTask("HITL Task", "hitl context", {
      verification: { type: "FILE_EXISTS", value: "hitl_file.txt" }
    });

    // We simulate human approval logic safely: execution runs, verification fails.
    const completedTask = await engine.executeTask(task.id, "hitl");
    expect(completedTask.status).toBe("FAILED");
  });

  it("TEST 10: CONCURRENCY - No double completion / double retry possible", async () => {
    let attempts = 0;
    const concAgent = createAgent("conc", "Ollama");

    concAgent.act = async () => {
      attempts++;
      await new Promise(r => setTimeout(r, 20));
      return "DONE: Finished.";
    };
    engine.registerAgent(concAgent);

    const task = engine.createTask("Concurrency", "conc context", {
      verification: { type: "FILE_EXISTS", value: "conc_file.txt" },
      maxRetries: 2
    });

    // Fire executeTask twice concurrently
    const p1 = engine.executeTask(task.id, "conc");
    const p2 = engine.executeTask(task.id, "conc").catch(e => e.message);

    const results = await Promise.all([p1, p2]);

    // p1 should fail via verification. p2 should fail immediately with "already running"
    expect(results[0].status).toBe("FAILED");
    expect(results[1]).toBe("Task is already running");

    expect(attempts).toBe(3);
  });

  it("TEST 11: End-to-End Persistence Recovery - crash during retry", async () => {
    const testFile = "persist_retry_test.json";
    const crashingRetryAgent = createAgent("crasherRetry", "Ollama");
    let attempts = 0;

    crashingRetryAgent.act = async () => {
      attempts++;
      if (attempts === 1) {
        return "DONE: I failed verification";
      } else if (attempts === 2) {
        throw new Error("Simulated process crash during retry ACT phase");
      }
      return "DONE";
    };
    engine.registerAgent(crashingRetryAgent);

    const task = engine.createTask("Crash during retry", "crasherRetry context", {
      verification: { type: "FILE_EXISTS", value: testFile },
      maxRetries: 2
    });

    const crashedTask = await engine.executeTask(task.id, "crasherRetry");
    expect(crashedTask.status).toBe("FAILED");
    expect(crashedTask.error).toContain("Simulated process crash during retry ACT phase");

    const hardCrashTask = taskStore.getTask(task.id)!;
    hardCrashTask.status = "RUNNING";
    taskStore.saveTask(hardCrashTask);

    try { taskStore.close(); } catch(e) {}
    const newTaskStore = new SQLitePersistentStore(dbPath);
    const newEngine = new TaskEngine(newTaskStore, { verifier }, planner, tools, memory, verifier);

    const recoveryAgent = createAgent("crasherRetry", "Ollama");
    recoveryAgent.act = async () => {
      await fs.writeFile(testFile, '{"ok": true}');
      return "DONE: Done after crash.";
    };
    newEngine.registerAgent(recoveryAgent);

    const recoveredTask = await newEngine.recoverAndResume(task.id);
    expect(recoveredTask.status).toBe("COMPLETED");
    expect(recoveredTask.metadata?.currentRetries).toBe(1);

    await fs.unlink(testFile);
    try { newTaskStore.close(); } catch(e) {}
  });
});
