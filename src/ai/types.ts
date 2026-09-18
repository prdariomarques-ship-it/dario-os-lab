/**
 * DARIUS OSS - AI Layer Core Types & Interfaces
 * Specification for Model Abstraction, Reasoning, Context Engineering, Routing & Evaluation
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  id?: string;
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface GenerateInputOptions {
  messages: ChatMessage[];
  systemInstruction?: string;
  tools?: ToolDefinition[];
}

export type GenerateInput = string | ChatMessage[] | GenerateInputOptions;

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingLevel?: 'minimal' | 'low' | 'high';
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface GenerateOutput {
  text: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  usage: TokenUsage;
  latencyMs: number;
  modelId: string;
  providerId: string;
  rawResponse?: unknown;
}

export interface StreamChunk {
  text: string;
  delta: string;
  isComplete: boolean;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface StructuredOutputSchema<T = unknown> {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  validator?: (parsed: unknown) => parsed is T;
}

export type LatencyTier = 'ultra-low' | 'low' | 'medium' | 'high';

export interface ModelCapabilities {
  modelId: string;
  providerId: string;
  name: string;
  streaming: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  multimodal: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
  costPer1kInputTokensUsd: number;
  costPer1kOutputTokensUsd: number;
  latencyTier: LatencyTier;
  reasoningCapable: boolean;
}

/**
 * Clean Model Abstraction Interface
 * All model providers (Gemini, OpenAI, Anthropic, Local Ollama, Mock)
 * must implement this contract to decouple the Core Runtime from specific vendors.
 */
export interface Model {
  readonly modelId: string;
  readonly providerId: string;

  /**
   * Generates a complete response from the model
   */
  generate(input: GenerateInput, options?: GenerateOptions): Promise<GenerateOutput>;

  /**
   * Streams generation chunks token-by-token
   */
  stream(input: GenerateInput, options?: GenerateOptions): AsyncIterable<StreamChunk>;

  /**
   * Generates deterministic structured output matching a defined schema
   */
  structuredOutput<T = unknown>(
    input: GenerateInput,
    schema: StructuredOutputSchema<T>,
    options?: GenerateOptions
  ): Promise<T>;

  /**
   * Declares the model's physical and operational capabilities
   */
  capabilities(): ModelCapabilities;
}
