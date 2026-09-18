import { Task, TaskExecution } from "../core/types.js";

export interface ContextConfig {
  maxTokens: number;
  relevanceThreshold: number; // 0.0 to 1.0
  includeHistory: boolean;
  maxHistorySteps: number;
}

export interface ContextChunk {
  source: "SYSTEM" | "TASK" | "HISTORY" | "MEMORY" | "TOOL_SCHEMA";
  content: string;
  tokens: number;
  relevance: number; // 1.0 is highest priority
}

export interface CompiledContext {
  taskObjective: string;
  systemPrompt?: string;
  chunks: ContextChunk[];
  totalTokens: number;
  fullPrompt: string; // The fully assembled string ready for the LLM
}

export interface ContextEngine {
  buildContext(task: Task, execution: TaskExecution, queryContext?: string): Promise<CompiledContext>;
}
