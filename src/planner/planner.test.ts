import { describe, expect, it, beforeEach } from "vitest";
import { SimplePlanner } from "./planner.js";
import { TaskGraph } from "./types.js";
import { Task } from "../core/types.js";
import { randomUUID } from "node:crypto";

describe("SimplePlanner", () => {
  let planner: SimplePlanner;

  const mockEngine = {
    createTask: (objective: string): Task => ({
      id: randomUUID(),
      objective,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  };

  beforeEach(() => {
    planner = new SimplePlanner(mockEngine);
  });

  it("should create a basic graph from an objective", async () => {
    const graph = await planner.plan("Test objective");
    expect(graph.tasks.length).toBe(1);
    expect(graph.tasks[0].objective).toBe("Test objective");
    expect(graph.status).toBe("PENDING");
  });

  it("should return executable tasks correctly based on dependencies", () => {
    const taskA = mockEngine.createTask("A");
    const taskB = mockEngine.createTask("B");
    const taskC = mockEngine.createTask("C"); // Depends on A and B

    const graph: TaskGraph = {
      id: "g1",
      objective: "complex",
      tasks: [taskA, taskB, taskC],
      dependencies: [
        { taskId: taskC.id, dependsOnId: taskA.id },
        { taskId: taskC.id, dependsOnId: taskB.id }
      ],
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    let executable = planner.getNextExecutableTasks(graph);
    expect(executable.length).toBe(2);
    expect(executable.map(t => t.id).sort()).toEqual([taskA.id, taskB.id].sort());

    // Mark A as running
    taskA.status = "RUNNING";
    executable = planner.getNextExecutableTasks(graph);
    expect(executable.length).toBe(1); // Only B is pending and has no deps
    expect(executable[0].id).toBe(taskB.id);

    // Mark A and B as completed
    taskA.status = "COMPLETED";
    taskB.status = "COMPLETED";
    executable = planner.getNextExecutableTasks(graph);
    expect(executable.length).toBe(1);
    expect(executable[0].id).toBe(taskC.id);
  });

  it("should update graph status correctly", () => {
    const taskA = mockEngine.createTask("A");
    const taskB = mockEngine.createTask("B");

    const graph: TaskGraph = {
      id: "g1",
      objective: "status check",
      tasks: [taskA, taskB],
      dependencies: [],
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    planner.updateGraphStatus(graph);
    expect(graph.status).toBe("PENDING");

    taskA.status = "RUNNING";
    planner.updateGraphStatus(graph);
    expect(graph.status).toBe("RUNNING");

    taskA.status = "COMPLETED";
    planner.updateGraphStatus(graph);
    expect(graph.status).toBe("RUNNING");

    taskB.status = "COMPLETED";
    planner.updateGraphStatus(graph);
    expect(graph.status).toBe("COMPLETED");

    taskB.status = "FAILED";
    planner.updateGraphStatus(graph);
    expect(graph.status).toBe("FAILED");
  });

  it("should throw error if task graph contains a cycle", () => {
    const taskA = mockEngine.createTask("A");
    const taskB = mockEngine.createTask("B");

    const graph: TaskGraph = {
      id: "g-cycle",
      objective: "cyclic graph",
      tasks: [taskA, taskB],
      dependencies: [
        { taskId: taskA.id, dependsOnId: taskB.id },
        { taskId: taskB.id, dependsOnId: taskA.id }
      ],
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect(() => planner.getNextExecutableTasks(graph)).toThrowError(/contains a cycle/);
  });

  it("should not return tasks whose dependencies have failed", () => {
    const taskA = mockEngine.createTask("A");
    const taskB = mockEngine.createTask("B"); // Depends on A

    const graph: TaskGraph = {
      id: "g2",
      objective: "fail test",
      tasks: [taskA, taskB],
      dependencies: [
        { taskId: taskB.id, dependsOnId: taskA.id }
      ],
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // A fails
    taskA.status = "FAILED";

    const executable = planner.getNextExecutableTasks(graph);
    // Because A failed, B cannot execute, should be empty
    expect(executable.length).toBe(0);
  });
});
