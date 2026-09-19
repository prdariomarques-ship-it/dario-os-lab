/**
 * DARIUS OSS - Dynamic Model Router
 * Directs tasks to optimal models based on complexity, cost, latency, and capabilities.
 */

import { Model, ModelCapabilities } from '../types.ts';
import { RouteCriteria, RoutingDecision, TaskComplexity } from './types.ts';

export class ModelRouter {
  private registeredModels: Map<string, Model> = new Map();

  constructor(models: Model[] = []) {
    for (const m of models) {
      this.registerModel(m);
    }
  }

  public registerModel(model: Model): void {
    this.registeredModels.set(model.modelId, model);
  }

  public getModel(modelId: string): Model | undefined {
    return this.registeredModels.get(modelId);
  }

  public listModels(): ModelCapabilities[] {
    return Array.from(this.registeredModels.values()).map((m) => m.capabilities());
  }

  /**
   * Assesses the inherent complexity of a prompt or task based on heuristics
   */
  public assessComplexity(prompt: string, estimatedTokens = 0): TaskComplexity {
    const text = prompt.toLowerCase();

    // High complexity keywords
    const complexPatterns = [
      /architecture/i,
      /refactor/i,
      /algorithm/i,
      /security audit/i,
      /multi-step/i,
      /formal proof/i,
      /compiler/i,
      /reasoning chain/i,
      /debug complex/i,
    ];

    const simplePatterns = [
      /translate/i,
      /summarize in one/i,
      /extract/i,
      /classify/i,
      /yes or no/i,
      /format json/i,
      /spell check/i,
      /quick greeting/i,
    ];

    if (complexPatterns.some((p) => p.test(text)) || estimatedTokens > 8000) {
      return 'complex';
    }

    if (simplePatterns.some((p) => p.test(text)) && estimatedTokens < 1000) {
      return 'simple';
    }

    return 'medium';
  }

  /**
   * Selects the most cost-effective and capable model for the given criteria
   */
  public route(criteria: RouteCriteria): RoutingDecision {
    const promptTokens = criteria.estimatedPromptTokens || 500;
    const outputTokens = criteria.expectedOutputTokens || 250;
    const complexity = this.assessComplexity(criteria.taskDescription, promptTokens);

    const candidateModels = Array.from(this.registeredModels.values()).filter((m) => {
      const caps = m.capabilities();
      if (criteria.requiredCapabilities?.toolCalling && !caps.toolCalling) return false;
      if (criteria.requiredCapabilities?.structuredOutput && !caps.structuredOutput) return false;
      if (criteria.requiredCapabilities?.multimodal && !caps.multimodal) return false;
      if (promptTokens + outputTokens > caps.maxContextTokens) return false;
      return true;
    });

    if (candidateModels.length === 0) {
      // Fallback to whatever is available
      const fallback = Array.from(this.registeredModels.values())[0];
      if (!fallback) {
        throw new Error('No models registered in ModelRouter');
      }
      return {
        selectedModelId: fallback.modelId,
        selectedProviderId: fallback.providerId,
        estimatedCostUsd: 0,
        expectedLatencyTier: fallback.capabilities().latencyTier,
        assessedComplexity: complexity,
        rationale: 'Fallback: no registered model strictly matched capability filter.',
      };
    }

    // Sort candidates according to priority
    const scored = candidateModels.map((m) => {
      const caps = m.capabilities();
      const cost =
        (promptTokens / 1000) * caps.costPer1kInputTokensUsd +
        (outputTokens / 1000) * caps.costPer1kOutputTokensUsd;

      let score = 0;

      // Match complexity tier
      if (complexity === 'simple') {
        // Favor ultra-low cost / ultra-low latency
        if (caps.latencyTier === 'ultra-low' || caps.modelId.includes('lite')) score += 50;
        score -= cost * 10000;
      } else if (complexity === 'complex') {
        // Favor reasoning & pro
        if (caps.reasoningCapable && (caps.modelId.includes('pro') || caps.latencyTier === 'medium')) {
          score += 60;
        } else {
          score += 20;
        }
      } else {
        // Medium complexity: Flash is king
        if (caps.modelId.includes('flash') && !caps.modelId.includes('lite')) score += 40;
        score -= cost * 5000;
      }

      // Priority adjustments
      if (criteria.priority === 'cost') {
        score -= cost * 20000;
      } else if (criteria.priority === 'latency') {
        if (caps.latencyTier === 'ultra-low') score += 40;
        if (caps.latencyTier === 'low') score += 25;
      } else if (criteria.priority === 'quality') {
        if (caps.modelId.includes('pro')) score += 40;
      }

      // Budget check
      if (criteria.maxBudgetUsd && cost > criteria.maxBudgetUsd) {
        score -= 200;
      }

      return { model: m, caps, cost, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0];
    const fallback = scored.length > 1 ? scored[1].model.modelId : undefined;

    return {
      selectedModelId: selected.model.modelId,
      selectedProviderId: selected.model.providerId,
      estimatedCostUsd: Number(selected.cost.toFixed(6)),
      expectedLatencyTier: selected.caps.latencyTier,
      assessedComplexity: complexity,
      rationale: `Selected [${selected.model.modelId}] for ${complexity} complexity under ${criteria.priority} priority (estimated cost: $${selected.cost.toFixed(6)}).`,
      fallbackModelId: fallback,
    };
  }
}
