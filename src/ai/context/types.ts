/**
 * DARIUS OSS - Context Engineering Types
 * Explicit modularization of prompt layers to avoid monolithic prompts
 */

import { ChatMessage, ToolDefinition } from '../types.ts';

export type ContextLayerType =
  | 'system_instructions'
  | 'task_context'
  | 'memory'
  | 'tools'
  | 'observations'
  | 'execution_history';

export interface MemoryEntry {
  id: string;
  source: 'semantic_search' | 'short_term_buffer' | 'user_profile' | 'workspace_kv';
  content: string;
  relevanceScore?: number;
  timestamp?: number;
}

export interface ObservationEntry {
  stepIndex: number;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  isError?: boolean;
  timestamp: number;
}

export interface ExecutionHistoryStep {
  stepIndex: number;
  thought: string;
  actionTaken: string;
  outcomeSummary: string;
}

export interface TaskContext {
  goal: string;
  constraints?: string[];
  userPreferences?: Record<string, string>;
  maxBudgetUsd?: number;
  deadline?: string;
  sessionId: string;
}

export interface ContextBudget {
  maxTotalTokens: number;
  reservedForOutput: number;
  layerAllocations?: Partial<Record<ContextLayerType, number>>;
}

export interface AssembledContext {
  systemInstruction: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  tokenEstimate: {
    total: number;
    breakdown: Record<ContextLayerType, number>;
  };
  truncatedLayers: ContextLayerType[];
}
