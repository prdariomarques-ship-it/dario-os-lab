import { describe, expect, it, beforeEach } from "vitest";
import { SimpleContextEngine } from "./engine.js";
import { InMemoryMemoryStore } from "../memory/engine.js";
import { Task, TaskExecution } from "../core/types.js";

describe("SimpleContextEngine", () => {
  let memoryStore: InMemoryMemoryStore;
  let contextEngine: SimpleContextEngine;

  const dummyTask: Task = {
    id: "task-1",
    objective: "Test objective with some keywords",
    status: "RUNNING",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const dummyExecution: TaskExecution = {
    id: "exec-1",
    taskId: "task-1",
    agentId: "agent-1",
    state: "OBSERVE",
    iterations: 1,
    maxIterations: 10,
    history: [
      { state: "OBSERVE", output: "Observed A", timestamp: new Date() },
      { state: "THINK", output: "Thought B", timestamp: new Date() }
    ],
    startedAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    memoryStore = new InMemoryMemoryStore();
  });

  it("should assemble a basic context prompt without memory", async () => {
    contextEngine = new SimpleContextEngine(memoryStore, undefined, "You are a helpful assistant.");
    const compiled = await contextEngine.buildContext(dummyTask, dummyExecution);

    expect(compiled.systemPrompt).toBe("You are a helpful assistant.");
    expect(compiled.chunks.length).toBe(3); // SYSTEM, TASK, HISTORY

    expect(compiled.chunks[0].source).toBe("SYSTEM");
    expect(compiled.chunks[1].source).toBe("TASK");
    expect(compiled.chunks[2].source).toBe("HISTORY");

    expect(compiled.fullPrompt).toContain("You are a helpful assistant.");
    expect(compiled.fullPrompt).toContain("Test objective");
    expect(compiled.fullPrompt).toContain("Thought B");
  });

  it("should truncate history based on maxHistorySteps config", async () => {
    const longExecution: TaskExecution = {
      ...dummyExecution,
      history: [
        { state: "OBSERVE", output: "Step 1", timestamp: new Date() },
        { state: "THINK", output: "Step 2", timestamp: new Date() },
        { state: "ACT", output: "Step 3", timestamp: new Date() },
        { state: "OBSERVE", output: "Step 4", timestamp: new Date() },
      ]
    };

    contextEngine = new SimpleContextEngine(memoryStore, { maxTokens: 1000, relevanceThreshold: 0, includeHistory: true, maxHistorySteps: 2 });
    const compiled = await contextEngine.buildContext(dummyTask, longExecution);

    const historyChunk = compiled.chunks.find(c => c.source === "HISTORY");
    expect(historyChunk?.content).toContain("Step 3");
    expect(historyChunk?.content).toContain("Step 4");
    expect(historyChunk?.content).not.toContain("Step 1"); // Truncated
  });

  it("should fetch relevant memories and respect the token budget limit", async () => {
    // Fill memory with data
    await memoryStore.save({ type: "SEMANTIC", content: "Test memory 1 that matches keyword", relevanceScore: 0.9 });
    await memoryStore.save({ type: "SEMANTIC", content: "Test memory 2 that matches keyword", relevanceScore: 0.8 });
    await memoryStore.save({ type: "SEMANTIC", content: "Test memory 3 that matches keyword", relevanceScore: 0.7 });

    // Very tight token budget: only enough room for System + Task + maybe 1 memory
    contextEngine = new SimpleContextEngine(memoryStore, { maxTokens: 40, relevanceThreshold: 0, includeHistory: false, maxHistorySteps: 5 }, "Sys");

    const compiled = await contextEngine.buildContext(dummyTask, { ...dummyExecution, history: [] }, "Test");

    const memoryChunks = compiled.chunks.filter(c => c.source === "MEMORY");

    expect(memoryChunks.length).toBeLessThan(3);
    expect(compiled.totalTokens).toBeLessThanOrEqual(40);
  });

  it("should prevent a 10,000+ token memory retrieval from overflowing a small budget", async () => {
    // Generate a massive string (>10,000 tokens)
    const massiveContent = "A".repeat(45000);

    await memoryStore.save({ type: "SEMANTIC", content: massiveContent, relevanceScore: 0.9 });

    // Set a strict budget
    contextEngine = new SimpleContextEngine(memoryStore, { maxTokens: 1000, relevanceThreshold: 0, includeHistory: false, maxHistorySteps: 0 });

    const compiled = await contextEngine.buildContext(dummyTask, { ...dummyExecution, history: [] }, "Test");

    // The giant memory should have been blocked/truncated
    expect(compiled.totalTokens).toBeLessThanOrEqual(1000);
    const memoryChunks = compiled.chunks.filter(c => c.source === "MEMORY");
    expect(memoryChunks.length).toBe(0); // It completely skips the chunk if it exceeds bounds in this naive MVP
  });

  it("should always preserve critical Task Information even if budget is tight", async () => {
    const tightEngine = new SimpleContextEngine(memoryStore, { maxTokens: 10, relevanceThreshold: 0, includeHistory: false, maxHistorySteps: 0 });
    const compiled = await tightEngine.buildContext(dummyTask, dummyExecution, "Test");

    // Task source chunk is added FIRST in priority, so it must exist even if it alone exceeds the 'maxTokens'
    const taskChunk = compiled.chunks.find(c => c.source === "TASK");
    expect(taskChunk).toBeDefined();
    expect(taskChunk?.content).toContain("Test objective");
  });
});
