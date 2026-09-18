import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { DeterministicVerificationEngine } from "./engine.js";
import { Task } from "../core/types.js";
import fs from "fs/promises";
import fsSync from "fs";

describe("DeterministicVerificationEngine", () => {
  let verifier: DeterministicVerificationEngine;

  beforeEach(() => {
    verifier = new DeterministicVerificationEngine();
  });

  const dummyTask: Task = {
    id: "task-verify",
    objective: "Do a thing",
    status: "RUNNING",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("should pass automatically if no verification criteria are provided", async () => {
    const result = await verifier.verify(dummyTask, "I did a thing");
    expect(result.passed).toBe(true);
  });

  it("TEST 1 - VALID SUCCESS: Should check deterministic physical evidence (FILE_EXISTS) and pass", async () => {
    const testFile = "test_verification.txt";
    await fs.writeFile(testFile, "hello");

    const taskWithCriteria: Task = {
      ...dummyTask,
      metadata: { verification: { type: "FILE_EXISTS", value: testFile } }
    };

    // Even if LLM says "banana", it only cares about the file existing
    const result = await verifier.verify(taskWithCriteria, "Agent: banana");
    expect(result.passed).toBe(true);

    await fs.unlink(testFile);
  });

  it("TEST 2 - FALSE SUCCESS: Should reject if LLM claims success but evidence is missing", async () => {
    const taskWithCriteria: Task = {
      ...dummyTask,
      metadata: { verification: { type: "FILE_EXISTS", value: "non_existent_file.txt" } }
    };

    // LLM lies
    const result = await verifier.verify(taskWithCriteria, "DONE: I successfully created the file.");

    expect(result.passed).toBe(false);
    expect(result.reason).toContain("File does not exist: non_existent_file.txt");
  });

  it("TEST 3 - MISSING RESULT: Should reject if expected schema is missing from output", async () => {
    const taskWithCriteria: Task = {
      ...dummyTask,
      metadata: { verification: { type: "SCHEMA_MATCH", value: ["id", "status"] } }
    };

    // Missing 'status' key
    const result = await verifier.verify(taskWithCriteria, 'DONE: {"id": 123}');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Schema missing required key: status");
  });

  it("TEST 4 - VERIFICATION ERROR: Should gracefully fail if custom verification throws an exception", async () => {
    verifier.registerCustomVerifier("unstable", async () => {
       throw new Error("API completely down");
    });

    const taskWithCriteria: Task = {
      ...dummyTask,
      metadata: { verification: { type: "CUSTOM", customVerifierId: "unstable", value: null } }
    };

    const result = await verifier.verify(taskWithCriteria, "DONE");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Verification execution error: API completely down");
  });
});
