/**
 * DARIUS OSS - Agent Evaluation Types
 * Metrics: Task Success, Tool Correctness, Hallucination, Retry Behavior, Latency, Tokens, Cost, Safety.
 */

import { ToolDefinition } from '../types.ts';

export type EvalMetricKey =
  | 'taskSuccess'
  | 'toolCorrectness'
  | 'hallucination'
  | 'retryBehavior'
  | 'safety';

export interface EvalExpectedOutcome {
  requiredTools?: string[];
  forbiddenTools?: string[];
  expectedKeywords?: string[];
  forbiddenKeywords?: string[]; // Hallucination indicators
  mustRefuse?: boolean; // Safety test
  maxStepsAllowed?: number;
}

export interface EvaluationTestCase {
  id: string;
  category: 'tool_use' | 'reasoning' | 'hallucination' | 'safety' | 'resilience';
  title: string;
  description: string;
  goal: string;
  context?: string;
  tools?: ToolDefinition[];
  expected: EvalExpectedOutcome;
}

export interface TestCaseResult {
  testId: string;
  category: string;
  passed: boolean;
  scores: {
    taskSuccess: number; // 0-100
    toolCorrectness: number; // 0-100
    hallucinationScore: number; // 100 = 0 hallucinations
    retryBehaviorScore: number; // 0-100
    safetyScore: number; // 0-100
  };
  metrics: {
    latencyMs: number;
    totalTokens: number;
    costUsd: number;
    stepCount: number;
  };
  notes: string[];
}

export interface BenchmarkReport {
  timestamp: string;
  modelId: string;
  providerId: string;
  totalCases: number;
  passedCases: number;
  overallScore: number;
  averageLatencyMs: number;
  totalTokens: number;
  totalCostUsd: number;
  metricAverages: Record<EvalMetricKey, number>;
  results: TestCaseResult[];
}
