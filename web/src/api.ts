import axios from "axios";

/**
 * DARIUS Web API client.
 *
 * Only the endpoints that EXIST in src/server.ts (plus the mounted Finance
 * plugin routes). Nothing is invented here. Trace payloads surface
 * high-level state and output summaries — never chain-of-thought.
 */

const client = axios.create({ baseURL: "/api", timeout: 15000 });

// ---- Core: dashboard / health / logs ----
export interface RuntimeHealth {
  status: string;
  latencyMs?: number;
  memoryUsageMB?: number;
}

export interface ExecutionLogEntry {
  id: string;
  taskId: string;
  executionId: string;
  timestamp: string;
  eventType: string;
  status: string;
  payload?: Record<string, unknown>;
}

export interface DashboardMetrics {
  totalAgents: number;
  activeAgents?: number;
  pausedAgents?: number;
  tasks: { active: number; completed: number; failed: number };
  health: RuntimeHealth;
  recentActivities: ExecutionLogEntry[];
}

export const getDashboard = () => client.get<DashboardMetrics>("/dashboard").then((r) => r.data);
export const getHealth = () => client.get<RuntimeHealth>("/health").then((r) => r.data);
export const getLogs = () => client.get<ExecutionLogEntry[]>("/logs").then((r) => r.data);

// ---- Core: tasks ----
export interface TaskSummary {
  id: string;
  objective: string;
  status: string;
  agentId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecutionStep {
  state: string;
  timestamp: string;
  output?: string;
  error?: string;
}

export interface TaskState {
  taskId: string;
  objective: string;
  status: string;
  currentState: string;
  iterations: number;
  trace: ExecutionStep[];
}

export const listTasks = () => client.get<TaskSummary[]>("/tasks").then((r) => r.data);
export const createTask = (objective: string, modelName?: string) =>
  client
    .post<TaskSummary>("/tasks", { objective, ...(modelName ? { modelName } : {}) })
    .then((r) => r.data);
export const getTaskState = (id: string) => client.get<TaskState>(`/tasks/${id}`).then((r) => r.data);

// ---- Core: agents ----
export interface AgentSummary {
  id: string;
  name: string;
  description?: string;
}

export const listAgents = () => client.get<AgentSummary[]>("/agents").then((r) => r.data);
export const getAgent = (id: string) => client.get<AgentSummary>(`/agents/${id}`).then((r) => r.data);

// ---- Core: memory / skills ----
export interface MemoryState {
  stats: { shortTermCount: number; sessionCount: number; longTermCount: number };
  recentEntries: Array<{ id?: string; type?: string; content?: string; createdAt?: string }>;
}

export const getMemory = () => client.get<MemoryState>("/memory").then((r) => r.data);
export const listSkills = () =>
  client.get<Array<{ id?: string; name?: string; description?: string }>>("/skills").then((r) => r.data);

// ---- Finance vertical (mounted via PluginHost) ----
export interface FinanceHolding {
  symbol: string;
  quantity: number;
  avgPrice?: number;
  assetClass?: string;
}

export interface FinanceTaskInput {
  portfolio: {
    baseCurrency: string;
    holdings: FinanceHolding[];
    totalWealth?: number;
  };
  riskProfile: {
    declaredTolerance: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" | "UNKNOWN";
    horizonMonths?: number;
  };
  questions?: string[];
}

export interface FinanceStatus {
  taskId: string;
  status: string;
  taskType?: string;
  error?: string;
  resultAvailable: boolean;
}

export const startFinanceAnalysis = (input: FinanceTaskInput) =>
  client.post<{ taskId: string; statusUrl: string }>("/finance/analysis", input).then((r) => r.data);
export const getFinanceStatus = (taskId: string) =>
  client.get<FinanceStatus>(`/finance/analysis/${taskId}`).then((r) => r.data);
export const getFinanceReport = (taskId: string) =>
  client.get<Record<string, unknown>>(`/finance/analysis/${taskId}/report`).then((r) => r.data);
export const approveFinance = (taskId: string, approver: string, comment?: string) =>
  client
    .post(`/finance/analysis/${taskId}/approve`, { approver, ...(comment ? { comment } : {}) })
    .then((r) => r.data);
export const rejectFinance = (taskId: string, approver: string, reason: string) =>
  client.post(`/finance/analysis/${taskId}/reject`, { approver, reason }).then((r) => r.data);

// Axios-aware error extraction for strict `unknown` catch variables.
export function apiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    return data?.error ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
