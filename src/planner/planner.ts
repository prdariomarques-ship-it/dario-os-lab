import { randomUUID } from "node:crypto";
import { Planner, TaskGraph, TaskDependency } from "./types.js";
import { Task } from "../core/types.js";

export class SimplePlanner implements Planner {
  constructor(private engine: { createTask(obj: string): Task }) {}

  async plan(objective: string): Promise<TaskGraph> {
    const task = this.engine.createTask(objective);

    return {
      id: randomUUID(),
      objective,
      tasks: [task],
      dependencies: [],
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Detects if the graph contains any cycles using DFS
  private hasCycles(graph: TaskGraph): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const dependents = graph.dependencies
        .filter(d => d.dependsOnId === nodeId)
        .map(d => d.taskId);

      for (const dep of dependents) {
        if (!visited.has(dep) && dfs(dep)) {
          return true;
        } else if (recStack.has(dep)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const task of graph.tasks) {
      if (!visited.has(task.id)) {
        if (dfs(task.id)) return true;
      }
    }

    return false;
  }

  getNextExecutableTasks(graph: TaskGraph): Task[] {
    if (this.hasCycles(graph)) {
      throw new Error("TaskGraph contains a cycle and cannot be executed.");
    }

    const executable: Task[] = [];

    for (const task of graph.tasks) {
      if (task.status !== "PENDING") {
        continue;
      }

      const dependencies = graph.dependencies.filter(d => d.taskId === task.id);

      // If any dependency has FAILED or CANCELLED, this task cannot be run.
      // In a real system, we'd mark this task as SKIPPED/CANCELLED here,
      // but for getNextExecutableTasks we just omit it from the executable list.
      const anyDepFailed = dependencies.some(d => {
        const depTask = graph.tasks.find(t => t.id === d.dependsOnId);
        return depTask && (depTask.status === "FAILED" || depTask.status === "CANCELLED");
      });

      if (anyDepFailed) {
        continue;
      }

      const allDepsMet = dependencies.every(d => {
        const depTask = graph.tasks.find(t => t.id === d.dependsOnId);
        return depTask && depTask.status === "COMPLETED";
      });

      if (allDepsMet) {
        executable.push(task);
      }
    }

    return executable;
  }

  updateGraphStatus(graph: TaskGraph): void {
    if (graph.tasks.length === 0) {
      graph.status = "COMPLETED";
      return;
    }

    const allCompleted = graph.tasks.every(t => t.status === "COMPLETED");
    if (allCompleted) {
      graph.status = "COMPLETED";
      return;
    }

    const anyFailed = graph.tasks.some(t => t.status === "FAILED" || t.status === "CANCELLED");
    const anyRunningOrCompleted = graph.tasks.some(t => t.status === "RUNNING" || t.status === "COMPLETED");

    if (anyFailed) {
      graph.status = "FAILED";
    } else if (anyRunningOrCompleted) {
      graph.status = "RUNNING";
    } else {
      graph.status = "PENDING";
    }
  }
}
