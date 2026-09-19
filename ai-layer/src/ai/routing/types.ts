/**
 * DARIUS OSS - Model Routing Types
 */

import { LatencyTier, ModelCapabilities } from '../types.ts';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

export interface RouteCriteria {
  taskDescription: string;
  estimatedPromptTokens?: number;
  expectedOutputTokens?: number;
  requiredCapabilities?: {
    toolCalling?: boolean;
    structuredOutput?: boolean;
    multimodal?: boolean;
    streaming?: boolean;
  };
  priority: 'cost' | 'latency' | 'quality' | 'balanced';
  maxBudgetUsd?: number;
  maxAcceptableLatency?: LatencyTier;
}

export interface RoutingDecision {
  selectedModelId: string;
  selectedProviderId: string;
  estimatedCostUsd: number;
  expectedLatencyTier: LatencyTier;
  assessedComplexity: TaskComplexity;
  rationale: string;
  fallbackModelId?: string;
}
