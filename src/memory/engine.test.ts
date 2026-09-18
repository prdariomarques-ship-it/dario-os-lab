import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { InMemoryMemoryStore } from "./engine.js";

describe("InMemoryMemoryStore", () => {
  let store: InMemoryMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should save and retrieve a memory entry", async () => {
    const entry = await store.save({
      type: "SHORT_TERM",
      content: "Task 123 is pending",
    });

    expect(entry.id).toBeDefined();
    expect(entry.content).toBe("Task 123 is pending");

    const retrieved = await store.get(entry.id);
    expect(retrieved).toEqual(entry);
  });

  it("should search memory by type and content", async () => {
    await store.save({ type: "SEMANTIC", content: "The sky is blue" });
    await store.save({ type: "EPISODIC", content: "I saw a blue car" });
    await store.save({ type: "SEMANTIC", content: "Grass is green" });

    let results = await store.search({ type: "SEMANTIC" });
    expect(results.length).toBe(2);

    results = await store.search({ contentContains: "blue" });
    expect(results.length).toBe(2);

    results = await store.search({ type: "SEMANTIC", contentContains: "blue" });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe("The sky is blue");
  });

  it("should order search results by relevance and creation time", async () => {
    await store.save({ type: "LONG_TERM", content: "A", relevanceScore: 0.5 });

    vi.advanceTimersByTime(100);
    await store.save({ type: "LONG_TERM", content: "B", relevanceScore: 0.9 });

    vi.advanceTimersByTime(100);
    await store.save({ type: "LONG_TERM", content: "C", relevanceScore: 0.5 }); // Same relevance as A, but newer

    const results = await store.search({});
    expect(results.length).toBe(3);
    expect(results[0].content).toBe("B"); // Highest relevance
    expect(results[1].content).toBe("C"); // Same relevance, newer
    expect(results[2].content).toBe("A"); // Same relevance, older
  });

  it("should handle expiration properly", async () => {
    const expiresAt = new Date(Date.now() + 1000);
    const entry = await store.save({
      type: "SESSION",
      content: "Temporary session data",
      expiresAt
    });

    let retrieved = await store.get(entry.id);
    expect(retrieved).toBeDefined();

    vi.advanceTimersByTime(1500);

    retrieved = await store.get(entry.id);
    expect(retrieved).toBeUndefined(); // Should be expired

    // Cleanup test
    await store.save({ type: "SESSION", content: "To be cleaned", expiresAt: new Date(Date.now() - 100) });
    const cleaned = await store.cleanup();
    expect(cleaned).toBe(1);
  });

  it("should update a memory entry", async () => {
    const entry = await store.save({ type: "SHORT_TERM", content: "Initial" });

    vi.advanceTimersByTime(10);
    const updated = await store.update(entry.id, { content: "Updated", relevanceScore: 0.8 });
    expect(updated).toBeDefined();
    expect(updated?.content).toBe("Updated");
    expect(updated?.relevanceScore).toBe(0.8);
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(entry.updatedAt.getTime());

    const retrieved = await store.get(entry.id);
    expect(retrieved?.content).toBe("Updated");
  });
});
