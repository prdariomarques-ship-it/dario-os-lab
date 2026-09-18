import { ModelProvider, ModelRequest, ModelResponse, ModelRouter } from "./types.js";

export class SimpleModelRouter implements ModelRouter {
  private providers: Map<string, ModelProvider> = new Map();

  registerProvider(provider: ModelProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Model provider '${provider.name}' is already registered.`);
    }
    this.providers.set(provider.name, provider);
  }

  async route(request: ModelRequest, requiredCapabilities: string[] = []): Promise<ModelResponse> {
    if (this.providers.size === 0) {
      throw new Error("No model providers registered.");
    }

    let selectedProvider: ModelProvider | undefined;

    // Direct routing if modelName is specified and matches a provider
    if (request.modelName && this.providers.has(request.modelName)) {
      selectedProvider = this.providers.get(request.modelName);
    } else {
      // Fallback routing based on capabilities
      for (const provider of this.providers.values()) {
        if (provider.supportsCapabilities(requiredCapabilities)) {
          selectedProvider = provider;
          break; // First match wins in MVP
        }
      }
    }

    if (!selectedProvider) {
      throw new Error("No suitable model provider found for the given requirements.");
    }

    try {
      return await selectedProvider.generate(request);
    } catch (error) {
      throw new Error(`Provider '${selectedProvider.name}' failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
