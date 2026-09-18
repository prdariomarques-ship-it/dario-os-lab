export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "PAUSED"
  | "QUEUED"; // Added for background execution

export type ExecutionState =
  | "IDLE"
  | "OBSERVE"
  | "THINK"
  | "ACT"
  | "DONE"
  | "ERROR"
  | "WAITING_APPROVAL"
  | "VERIFY";

export interface Task {
  id: string;
  objective: string;
  status: TaskStatus;
  context?: string;
  result?: string;
  error?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionStep {
  state: ExecutionState;
  timestamp: Date;
  output?: string;
  error?: string;
}

export interface TaskExecution {
  id: string; // Separated execution identity
  taskId: string;
  agentId: string;
  state: ExecutionState;
  iterations: number;
  maxIterations: number;
  history: ExecutionStep[];
  startedAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;

  observe?: (task: Task, context: TaskExecution) => Promise<string>;
  think?: (task: Task, context: TaskExecution) => Promise<string>;
  act?: (task: Task, context: TaskExecution) => Promise<string>;

  execute?: (task: Task) => Promise<string>;
}

export interface TaskStore {
  saveTask(task: Task): void;
  getTask(id: string): Task | undefined;
  listTasks(): Task[];
  deleteTask(id: string): boolean;
}

export interface ExecutionStore {
  saveExecution(execution: TaskExecution): void;
  getExecution(id: string): TaskExecution | undefined;
  getByTaskId(taskId: string): TaskExecution[];
}

export interface EngineEvent {
  type: "TASK_CREATED" | "STATE_CHANGED" | "TASK_COMPLETED" | "TASK_FAILED" | "APPROVAL_REQUESTED" | "TASK_CANCELLED";
  taskId: string;
  timestamp: Date;
  payload: Record<string, any>;
}

export interface EngineObserver {
  onEvent(event: EngineEvent): void;
}
