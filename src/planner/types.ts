import { Task } from "../core/types.js";

export interface TaskDependency {
  taskId: string;
  dependsOnId: string;
}

export interface TaskGraph {
  id: string;
  objective: string;
  tasks: Task[];
  dependencies: TaskDependency[];
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL";
  createdAt: Date;
  updatedAt: Date;
}

export interface Planner {
  plan(objective: string): Promise<TaskGraph>;
  getNextExecutableTasks(graph: TaskGraph): Task[];
  updateGraphStatus(graph: TaskGraph): void;
}
