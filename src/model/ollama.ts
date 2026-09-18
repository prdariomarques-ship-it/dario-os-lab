import { ModelProvider, ModelRequest, ModelResponse } from "./types.js";

// OllamaProvider implements the ModelPort to talk to a local Ollama instance
// It abstracts away the HTTP protocol, mapping the CompiledContext to an Ollama request.
export class OllamaProvider implements ModelProvider {
  public name = "ollama";
  private baseUrl: string;

  constructor(baseUrl: string = "http://127.0.0.1:11434") {
    this.baseUrl = baseUrl;
  }

  supportsCapabilities(caps: string[]): boolean {
    // For now we assume a general-purpose model is bound, typically llama3 or mistral
    // If vision is required, we assume false unless explicitly configured.
    return !caps.includes("vision");
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const model = request.modelName || "llama3"; // Default model

    const payload = {
      model: model,
      prompt: request.context.fullPrompt,
      stream: false,
      options: {
        temperature: request.temperature || 0.7,
        num_predict: request.maxTokens || 1024,
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Ollama API returned ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();

      // Ollama returns eval_count for completion tokens and prompt_eval_count for prompt tokens
      return {
        text: data.response,
        finishReason: data.done_reason === "stop" ? "stop" : "length",
        usage: {
          promptTokens: data.prompt_eval_count || request.context.totalTokens, // fallback if absent
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || request.context.totalTokens) + (data.eval_count || 0)
        }
      };
    } catch (error) {
      throw new Error(`Ollama connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
