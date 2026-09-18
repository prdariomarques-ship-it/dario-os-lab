import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SQLitePersistentStore } from "./sqlite.js";
import { TaskEngine } from "./engine.js";
import { AutonomousAgent } from "./agent.js";
import { SimpleContextEngine } from "../context/engine.js";
import { InMemoryMemoryStore } from "../memory/engine.js";
import { SimpleModelRouter } from "../model/router.js";
import { MockModelProvider } from "../model/engine.js";
import { SimpleToolEngine } from "../tools/engine.js";
import { Tool } from "../tools/types.js";
import fs from "fs";

describe("DARIUS End-to-End Execution Flow with Tools", () => {
  const dbPath = "e2e-tools.db";
  let store: SQLitePersistentStore;
  let taskEngine: TaskEngine;
  let memory: InMemoryMemoryStore;
  let contextEngine: SimpleContextEngine;
  let router: SimpleModelRouter;
  let mockProvider: MockModelProvider;
  let toolEngine: SimpleToolEngine;
  let agent: AutonomousAgent;

  const mathTool: Tool = {
    name: "math",
    description: "Adds two numbers",
    risk: "LOW",
    schema: { a: "number", b: "number" },
    execute: async (params) => {
      const a = params.a as number;
      const b = params.b as number;
      return String(a + b);
    }
  };

  const riskyTool: Tool = {
    name: "delete_db",
    description: "Deletes the database",
    risk: "CRITICAL",
    schema: {},
    execute: async () => "DB DELETED"
  };

  beforeEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    store = new SQLitePersistentStore(dbPath);
    // Increase maxIterations to give the loop enough room to: Observe -> Think -> Act (Tool Call) -> Observe -> Think -> Act (Done)
    taskEngine = new TaskEngine(store, { maxIterations: 10 });

    memory = new InMemoryMemoryStore();
    contextEngine = new SimpleContextEngine(memory, {
      maxTokens: 1000,
      includeHistory: true,
      maxHistorySteps: 5,
      relevanceThreshold: 0
    }, "System: You are an autonomous E2E agent.");

    router = new SimpleModelRouter();
    mockProvider = new MockModelProvider();

    // Patch mock provider to simulate tool calls if the objective requests it
    mockProvider.generate = async (req) => {
       const isActPhase = req.temperature === 0.2 || req.context.fullPrompt.includes("action");
       let responseText = "Thinking...";

       if (isActPhase) {
          if (req.context.taskObjective.includes("MATH")) {
            // Check if history already has the tool result. The history is embedded in fullPrompt by ContextEngine.
            if (req.context.fullPrompt.includes("TOOL_RESULT [math]:")) {
              responseText = "DONE: Math complete";
            } else {
              responseText = `TOOL_CALL: {"name": "math", "params": {"a": 2, "b": 3}}`;
            }
          } else if (req.context.taskObjective.includes("RISK")) {
            responseText = `TOOL_CALL: {"name": "delete_db", "params": {}}`;
          } else {
            responseText = "DONE: Task complete";
          }
       }

       return {
         text: responseText,
         finishReason: "stop",
         usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
       };
    };
    router.registerProvider(mockProvider);

    toolEngine = new SimpleToolEngine({ allowCriticalRisk: false });
    toolEngine.register(mathTool);
    toolEngine.register(riskyTool);

    agent = new AutonomousAgent("e2e-agent", "E2E LLM Agent", contextEngine, router, toolEngine);
    taskEngine.registerAgent(agent);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("should successfully parse and execute a valid tool call during ACT", async () => {
    const task = taskEngine.createTask("Test Objective MATH");
    const finishedTask = await taskEngine.executeTask(task.id, agent.id);

    expect(finishedTask.status).toBe("COMPLETED");
    expect(finishedTask.result).toContain("Math complete");

    const execs = store.getByTaskId(task.id);
    const history = execs[0].history;

    const actSteps = history.filter(h => h.state === "ACT");
    expect(actSteps.length).toBeGreaterThanOrEqual(2);

    // The first ACT step should contain the result of the tool
    expect(actSteps[0].output).toContain('TOOL_RESULT [math]: "5"');
  });

  it("should fail safely if a tool call violates risk policy", async () => {
    const task = taskEngine.createTask("Test Objective RISK");
    const finishedTask = await taskEngine.executeTask(task.id, agent.id);

    expect(finishedTask.status).toBe("FAILED");
    expect(finishedTask.error).toContain("Exceeded maximum iterations without completing");

    const execs = store.getByTaskId(task.id);
    const actSteps = execs[0].history.filter(h => h.state === "ACT");

    expect(actSteps[0].output).toContain("TOOL_ERROR");
    expect(actSteps[0].output).toContain("not allowed by current policy");
  });

  it("should perform VERIFY phase before completion and fail if invalid", async () => {
    // We inject a DeterministicVerificationEngine manually to test this hook
    const { DeterministicVerificationEngine } = await import("../verification/engine.js");
    const verifier = new DeterministicVerificationEngine();

    // Create a new engine instance for this specific test
    const verifierEngine = new TaskEngine(store, { maxIterations: 5, verifier } as any);
    verifierEngine.registerAgent(agent);

    const task = verifierEngine.createTask("Test Objective", "ctx", { successCriteria: "must contain 42" });

    // The agent will output 'DONE: Task complete' which doesn't contain 42
    const finishedTask = await verifierEngine.executeTask(task.id, agent.id);

    expect(finishedTask.status).toBe("FAILED");
    expect(finishedTask.error).toContain("Verification failed");

    // Check history trace for VERIFY step
    const execs = store.getByTaskId(task.id);
    const history = execs[0].history;
    const verifyStep = history.find(h => h.state === "VERIFY");

    expect(verifyStep).toBeDefined();
    expect(verifyStep?.output).toBe("Verification: FAIL");
  });
});
