/**
 * DARIUS OSS - Gemini Model Provider
 * Implements the Model interface using the @google/genai SDK.
 */

import { GoogleGenAI, Type } from '@google/genai';
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
  ToolDefinition,
} from '../types.ts';

export interface GeminiProviderOptions {
  apiKey?: string;
  modelId?: string;
  client?: GoogleGenAI;
}

export class GeminiProvider implements Model {
  public readonly providerId = 'google-genai';
  public readonly modelId: string;
  private client: GoogleGenAI;
  private apiKey?: string;

  constructor(options: GeminiProviderOptions = {}) {
    this.modelId = options.modelId || 'gemini-3.8-flash';
    this.apiKey = options.apiKey || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined);

    if (options.client) {
      this.client = options.client;
    } else {
      this.client = new GoogleGenAI({
        apiKey: this.apiKey || '',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  /**
   * Helper to normalize GenerateInput into contents, systemInstruction and tools for Gemini
   */
  private normalizeInput(input: GenerateInput): {
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
    systemInstruction?: string;
    tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>;
  } {
    if (typeof input === 'string') {
      return {
        contents: [{ role: 'user', parts: [{ text: input }] }],
      };
    }

    if (Array.isArray(input)) {
      let systemInstruction: string | undefined;
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (const msg of input) {
        if (msg.role === 'system') {
          systemInstruction = systemInstruction ? `${systemInstruction}\n${msg.content}` : msg.content;
        } else {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const text = msg.role === 'tool' ? `[Tool Result ${msg.name || ''}]: ${msg.content}` : msg.content;
          contents.push({
            role,
            parts: [{ text }],
          });
        }
      }

      if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: '...' }] });
      }

      return { contents, systemInstruction };
    }

    // GenerateInputOptions object
    const { messages, systemInstruction: sysInst, tools: toolDefs } = input;
    const normalized = this.normalizeInput(messages);
    const systemInstruction = sysInst || normalized.systemInstruction;

    let tools: Array<{ functionDeclarations: Array<Record<string, unknown>> }> | undefined;
    if (toolDefs && toolDefs.length > 0) {
      tools = [
        {
          functionDeclarations: toolDefs.map((t: ToolDefinition) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    return {
      contents: normalized.contents,
      systemInstruction,
      tools,
    };
  }

  public async generate(input: GenerateInput, options: GenerateOptions = {}): Promise<GenerateOutput> {
    const startTime = Date.now();
    const { contents, systemInstruction, tools } = this.normalizeInput(input);

    const config: Record<string, unknown> = {};

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (typeof options.temperature === 'number') {
      config.temperature = options.temperature;
    }
    if (typeof options.maxTokens === 'number') {
      config.maxOutputTokens = options.maxTokens;
    }
    if (typeof options.topP === 'number') {
      config.topP = options.topP;
    }
    if (typeof options.topK === 'number') {
      config.topK = options.topK;
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      config.stopSequences = options.stopSequences;
    }
    if (tools) {
      config.tools = tools;
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents: contents as unknown as string,
        config,
      });

      const latencyMs = Date.now() - startTime;
      const text = response.text || '';

      const toolCalls: ToolCall[] = [];
      if (response.functionCalls) {
        for (let i = 0; i < response.functionCalls.length; i++) {
          const fc = response.functionCalls[i];
          toolCalls.push({
            id: `call_${Date.now()}_${i}`,
            name: fc.name || 'unknown_tool',
            args: (fc.args as Record<string, unknown>) || {},
          });
        }
      }

      const promptTokens = response.usageMetadata?.promptTokenCount || 0;
      const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = response.usageMetadata?.totalTokenCount || promptTokens + completionTokens;

      const caps = this.capabilities();
      const estimatedCostUsd =
        (promptTokens / 1000) * caps.costPer1kInputTokensUsd +
        (completionTokens / 1000) * caps.costPer1kOutputTokensUsd;

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: response.candidates?.[0]?.finishReason || 'STOP',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCostUsd,
        },
        latencyMs,
        modelId: this.modelId,
        providerId: this.providerId,
        rawResponse: response,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`GeminiProvider Error [${this.modelId}]: ${errorMsg}`);
    }
  }

  public async *stream(input: GenerateInput, options: GenerateOptions = {}): AsyncIterable<StreamChunk> {
    const { contents, systemInstruction, tools } = this.normalizeInput(input);

    const config: Record<string, unknown> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (typeof options.temperature === 'number') config.temperature = options.temperature;
    if (typeof options.maxTokens === 'number') config.maxOutputTokens = options.maxTokens;
    if (tools) config.tools = tools;

    try {
      const streamResponse = await this.client.models.generateContentStream({
        model: this.modelId,
        contents: contents as unknown as string,
        config,
      });

      let accumulated = '';
      for await (const chunk of streamResponse) {
        const delta = chunk.text || '';
        accumulated += delta;

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
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`GeminiProvider Stream Error [${this.modelId}]: ${errorMsg}`);
    }
  }

  public async structuredOutput<T = unknown>(
    input: GenerateInput,
    schema: StructuredOutputSchema<T>,
    options: GenerateOptions = {}
  ): Promise<T> {
    const { contents, systemInstruction } = this.normalizeInput(input);

    const config: Record<string, unknown> = {
      responseMimeType: 'application/json',
      responseSchema: schema.schema,
    };

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (typeof options.temperature === 'number') {
      config.temperature = options.temperature;
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents: contents as unknown as string,
        config,
      });

      const rawText = (response.text || '').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response for schema [${schema.name}]: ${rawText}`);
      }

      if (schema.validator && !schema.validator(parsed)) {
        throw new Error(`Structured output failed schema validation for [${schema.name}]`);
      }

      return parsed as T;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`GeminiProvider structuredOutput Error [${this.modelId}]: ${errorMsg}`);
    }
  }

  public capabilities(): ModelCapabilities {
    const isPro = this.modelId.includes('pro');
    const isLite = this.modelId.includes('lite');

    return {
      modelId: this.modelId,
      providerId: this.providerId,
      name: isPro ? 'Gemini 3.1 Pro' : isLite ? 'Gemini 3.1 Flash Lite' : 'Gemini 3.8 Flash',
      streaming: true,
      structuredOutput: true,
      toolCalling: true,
      multimodal: true,
      maxContextTokens: 1048576, // 1M tokens
      maxOutputTokens: 65536,
      costPer1kInputTokensUsd: isPro ? 0.00125 : isLite ? 0.000075 : 0.00015,
      costPer1kOutputTokensUsd: isPro ? 0.005 : isLite ? 0.0003 : 0.0006,
      latencyTier: isLite ? 'ultra-low' : isPro ? 'medium' : 'low',
      reasoningCapable: true,
    };
  }
}
