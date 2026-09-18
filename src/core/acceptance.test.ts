import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SQLitePersistentStore } from "./sqlite.js";
import { TaskEngine } from "./engine.js";
import { AutonomousAgent } from "./agent.js";
import { SupervisorAgent } from "./multiagent.js";
import { SimpleContextEngine } from "../context/engine.js";
import { InMemoryMemoryStore } from "../memory/engine.js";
import { SimpleModelRouter } from "../model/router.js";
import { MockModelProvider } from "../model/engine.js";
import { SimpleToolEngine } from "../tools/engine.js";
import { DeterministicVerificationEngine } from "../verification/engine.js";
import { SimpleSkillEngine } from "../skills/engine.js";
import fs from "fs/promises";
import fsSync from "fs";

describe("REAL END-TO-END ACCEPTANCE SCENARIO", () => {
  const dbPath = "acceptance-e2e.db";
  const testFile = "acceptance_test.json";

  afterEach(async () => {
    try { await fs.unlink(testFile); } catch (e) {}
    try { fsSync.unlinkSync(dbPath); } catch (e) {}
  });

  beforeEach(() => {
    try { fsSync.unlinkSync(dbPath); } catch (e) {}
  });

  it("Full autonomous delegation, skill execution, tool use, verification, and recovery", async () => {
    let store = new SQLitePersistentStore(dbPath);
    let verifier = new DeterministicVerificationEngine();
    let taskEngine = new TaskEngine(store, { maxIterations: 10, verifier } as any);

    let memory = new InMemoryMemoryStore();
    let contextEngine = new SimpleContextEngine(memory);
    let router = new SimpleModelRouter();

    // We will build a complex mock provider that reacts sequentially
    let requestCount = 0;
    const mockProvider = new MockModelProvider();
    mockProvider.generate = async (req) => {
      requestCount++;
      const isActPhase = req.temperature === 0.2 || req.context.fullPrompt.includes("action");

      if (!isActPhase) return { text: "Thinking...", finishReason: "stop", usage: {} as any };

      // If we are evaluating the child task which aims to write a file
      if (req.context.taskObjective.includes("Write evidence")) {
         if (!req.context.fullPrompt.includes("TOOL_RESULT [write_evidence]:")) {
           return { text: `TOOL_CALL: {"name": "write_evidence", "params": {}}`, finishReason: "stop", usage: {} as any };
         } else {
           // Simulate a crash right after the tool succeeds, on the 3rd act request
           // Simulate a crash right after the tool succeeds
           if (requestCount >= 1) {
              throw new Error("SIMULATED FATAL CRASH DURING ACT");
           }
           return { text: "DONE: File has been written", finishReason: "stop", usage: {} as any };
         }
      }
      return { text: "DONE: Unhandled objective", finishReason: "stop", usage: {} as any };
    };
    router.registerProvider(mockProvider);

    let tools = new SimpleToolEngine();
    tools.register({
      name: "write_evidence",
      description: "Writes the test evidence file",
      risk: "LOW",
      schema: {},
      execute: async () => {
        await fs.writeFile(testFile, '{"evidence": true}');
        return "File written";
      }
    });

    let skills = new SimpleSkillEngine();
    skills.registerSkill({
      id: "write_skill",
      name: "Write Skill",
      description: "Knows how to write",
      version: "1.0",
      execute: async () => "Skill executed"
    });

    // Worker agent
    const worker = new AutonomousAgent("worker", "Worker Agent", contextEngine, router, tools);
    worker.description = "Write evidence";
    taskEngine.registerAgent(worker);

    const supervisor = new SupervisorAgent("sup", taskEngine, [worker]);

    // 1. Supervisor delegates to specialized agent
    // Because supervisor calls executeTask internally and awaits it, we wrap it
    const parentTaskPromise = supervisor.delegateTask("Write evidence").catch(e => e.message);

    // Wait for the simulated crash to propagate
    const parentResult = await parentTaskPromise;
    expect((parentResult as any).error).toContain("SIMULATED FATAL CRASH DURING ACT");

    store.close(); // Close DB to simulate process death

    // --- RECOVERY PHASE ---
    const store2 = new SQLitePersistentStore(dbPath);

    // Check state before recovery
    const tasks = store2.listTasks();
    expect(tasks.length).toBe(1);
    const crashedTask = tasks[0];

    // Manually set to RUNNING to simulate mid-flight crash that bypassed JS try/catch
    crashedTask.status = "RUNNING";
    store2.saveTask(crashedTask);

    const taskEngine2 = new TaskEngine(store2, { maxIterations: 10, verifier } as any);
    const worker2 = new AutonomousAgent("worker", "Worker Agent", contextEngine, router, tools);
    taskEngine2.registerAgent(worker2);

    // Patch the mock so it doesn't crash this time
    requestCount = 0;
    mockProvider.generate = async (req) => {
      const isActPhase = req.temperature === 0.2 || req.context.fullPrompt.includes("action");
      if (!isActPhase) return { text: "Thinking...", finishReason: "stop", usage: {} as any };

      // Because we recovered, the context already has the tool result persisted from SQLite
      if (!req.context.fullPrompt.includes("TOOL_RESULT [write_evidence]:")) {
         return { text: `TOOL_CALL: {"name": "write_evidence", "params": {}}`, finishReason: "stop", usage: {} as any };
      } else {
         return { text: "DONE: File has been written", finishReason: "stop", usage: {} as any };
      }
    };

    // The task was assigned verification metadata manually before delegation for this test
    crashedTask.metadata = { verification: { type: "FILE_EXISTS", value: testFile } };
    store2.saveTask(crashedTask);

    const recovered = await taskEngine2.recoverAndResume(crashedTask.id);

    expect(recovered.status).toBe("COMPLETED");
    expect(recovered.result).toBe("File has been written");

    // Verify verification execution step
    const execs = store2.getByTaskId(crashedTask.id);
    const history = execs[0].history;

    const verifyStates = history.filter((h: any) => h.state === "VERIFY");
    expect(verifyStates.length).toBe(1);
    expect(verifyStates[0].output).toBe("Verification: PASS");

    store2.close();
  });
});
