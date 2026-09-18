/**
 * DARIUS OSS - Agent Reasoning & Structured Decision Schemas
 */

export type NextActionType = 'call_tool' | 'ask_user' | 'finish' | 'reflect';

export interface PlannedToolCall {
  toolName: string;
  parameters: Record<string, unknown>;
  expectedOutcome: string;
}

/**
 * Deterministic Schema for Model Agent Reasoning Steps.
 * Prevents hallucinations and unconstrained autonomy.
 */
export interface AgentDecision {
  thought: string;
  stateAssessment: string;
  progressPercentage: number;
  nextAction: NextActionType;
  toolCall?: PlannedToolCall;
  finalAnswer?: string;
  reflectionPrompt?: string;
  confidence: number;
}

export interface ReasoningStepRecord {
  stepNumber: number;
  decision: AgentDecision;
  toolResult?: unknown;
  durationMs: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ReasoningExecutionConfig {
  maxSteps: number; // Hard ceiling on iterations (default: 5)
  maxCostUsd?: number;
  timeoutMs?: number;
  requireUserApprovalForTools?: string[];
  stopOnFirstError?: boolean;
}

export interface ReasoningExecutionResult {
  sessionId: string;
  goal: string;
  status: 'completed' | 'max_steps_reached' | 'budget_exceeded' | 'error' | 'user_input_required';
  finalOutput?: string;
  steps: ReasoningStepRecord[];
  totalLatencyMs: number;
  totalTokens: number;
  totalCostUsd: number;
  error?: string;
}
