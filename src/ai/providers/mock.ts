/**
 * DARIUS OSS - Mock Model Provider
 * Deterministic model provider for automated tests, offline development,
 * fixture verification, and evaluation without consuming external quota.
 */

import {
  ChatMessage,
  GenerateInput,
  GenerateOptions,
  GenerateOutput,
  Model,
  ModelCapabilities,
  StreamChunk,
  StructuredOutputSchema,
  ToolCall,
} from '../types.ts';

export interface MockResponseRule {
  pattern?: RegExp | string;
  response: string;
  toolCalls?: ToolCall[];
  structuredData?: Record<string, unknown>;
  latencyMs?: number;
}

export class MockProvider implements Model {
  public readonly providerId = 'darius-mock';
  public readonly modelId: string;
  private rules: MockResponseRule[] = [];
  private defaultResponse: string;

  constructor(modelId = 'darius-mock-v1', defaultResponse = 'Mock generation completed successfully.') {
    this.modelId = modelId;
    this.defaultResponse = defaultResponse;
    this.registerDefaultRules();
  }

  private registerDefaultRules() {
    this.rules = [
      {
        pattern: /search|find|lookup/i,
        response: 'I will search for the requested information.',
        toolCalls: [
          {
            id: 'mock_search_1',
            name: 'web_search',
            args: { query: 'darius agent architecture' },
          },
        ],
      },
      {
        pattern: /calculate|math|compute/i,
        response: 'Computing the mathematical result.',
        toolCalls: [
          {
            id: 'mock_calc_1',
            name: 'calculator',
            args: { expression: '42 * 10' },
          },
        ],
      },
      {
        pattern: /plan|reason|step/i,
        response: 'Analyzed goal. Formulating step-by-step reasoning plan.',
      },
    ];
  }

  public addRule(rule: MockResponseRule): void {
    this.rules.unshift(rule);
  }

  private extractPromptText(input: GenerateInput): string {
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      return input.map((m: ChatMessage) => m.content).join('\n');
    }
    return (
      (input.systemInstruction ? `[System] ${input.systemInstruction}\n` : '') +
      input.messages.map((m: ChatMessage) => m.content).join('\n')
    );
  }

  public async generate(input: GenerateInput, options: GenerateOptions = {}): Promise<GenerateOutput> {
    const promptText = this.extractPromptText(input);
    const matchedRule = this.rules.find((r) =>
      r.pattern ? (typeof r.pattern === 'string' ? promptText.includes(r.pattern) : r.pattern.test(promptText)) : false
    );

    const simulatedLatency = matchedRule?.latencyMs ?? 35;
    if (simulatedLatency > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatedLatency));
    }

    const responseText = matchedRule ? matchedRule.response : this.defaultResponse;
    const toolCalls = matchedRule?.toolCalls;

    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(responseText.length / 4);

    return {
      text: responseText,
      toolCalls,
      finishReason: 'STOP',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostUsd: 0,
      },
      latencyMs: simulatedLatency,
      modelId: this.modelId,
      providerId: this.providerId,
    };
  }

  public async *stream(input: GenerateInput, options: GenerateOptions = {}): AsyncIterable<StreamChunk> {
    const promptText = this.extractPromptText(input);
    const matchedRule = this.rules.find((r) =>
      r.pattern ? (typeof r.pattern === 'string' ? promptText.includes(r.pattern) : r.pattern.test(promptText)) : false
    );

    const fullText = matchedRule ? matchedRule.response : this.defaultResponse;
    const words = fullText.split(' ');

    let accumulated = '';
    for (let i = 0; i < words.length; i++) {
      const delta = (i > 0 ? ' ' : '') + words[i];
      accumulated += delta;
      await new Promise((res) => setTimeout(res, 20));

      yield {
        text: accumulated,
        delta,
        isComplete: false,
      };
    }

    yield {
      text: accumulated,
      delta: '',
      isComplete: true,
      usage: {
        promptTokens: Math.ceil(promptText.length / 4),
        completionTokens: Math.ceil(fullText.length / 4),
        totalTokens: Math.ceil((promptText.length + fullText.length) / 4),
        estimatedCostUsd: 0,
      },
    };
  }

  public async structuredOutput<T = unknown>(
    input: GenerateInput,
    schema: StructuredOutputSchema<T>,
    options: GenerateOptions = {}
  ): Promise<T> {
    const promptText = this.extractPromptText(input);

    const matchedRule = this.rules.find((r) =>
      r.pattern ? (typeof r.pattern === 'string' ? promptText.includes(r.pattern) : r.pattern.test(promptText)) : false
    );

    let outputData: unknown = matchedRule?.structuredData;

    // Provide default structured object based on schema name if none matched
    if (!outputData) {
      if (schema.name === 'AgentDecision') {
        outputData = {
          thought: 'Synthesizing objective from task context and current observations.',
          stateAssessment: 'Initial phase. Preparing execution sequence.',
          nextAction: 'call_tool',
          toolToCall: {
            toolName: 'web_search',
            parameters: { query: 'DARIUS OSS reasoning patterns' },
          },
          confidence: 0.94,
        };
      } else {
        outputData = {
          status: 'success',
          summary: 'Mock structured payload completed',
          timestamp: new Date().toISOString(),
          contextLength: promptText.length,
        };
      }
    }

    if (schema.validator && !schema.validator(outputData)) {
      throw new Error(`MockProvider: structured output does not satisfy validator for schema [${schema.name}]`);
    }

    return outputData as T;
  }

  public capabilities(): ModelCapabilities {
    return {
      modelId: this.modelId,
      providerId: this.providerId,
      name: 'DARIUS Local Mock Provider',
      streaming: true,
      structuredOutput: true,
      toolCalling: true,
      multimodal: false,
      maxContextTokens: 32768,
      maxOutputTokens: 4096,
      costPer1kInputTokensUsd: 0,
      costPer1kOutputTokensUsd: 0,
      latencyTier: 'ultra-low',
      reasoningCapable: true,
    };
  }
}
