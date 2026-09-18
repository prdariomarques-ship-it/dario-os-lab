import { CompiledContext } from "../context/types.js";

export interface ModelRequest {
  context: CompiledContext;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  text: string;
  finishReason: "stop" | "length" | "tool_call" | "error";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelProvider {
  name: string;
  supportsCapabilities(caps: string[]): boolean;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export interface ModelRouter {
  registerProvider(provider: ModelProvider): void;
  route(request: ModelRequest, requiredCapabilities?: string[]): Promise<ModelResponse>;
}
