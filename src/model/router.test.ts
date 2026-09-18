import { describe, expect, it, beforeEach } from "vitest";
import { SimpleModelRouter } from "./router.js";
import { MockModelProvider } from "./engine.js";
import { ModelRequest, ModelProvider } from "./types.js";
import { CompiledContext } from "../context/types.js";

describe("SimpleModelRouter", () => {
  let router: SimpleModelRouter;
  let mockProvider: MockModelProvider;

  const dummyContext: CompiledContext = {
    taskObjective: "Test Objective",
    chunks: [],
    totalTokens: 10,
    fullPrompt: "--- TASK ---\nObjective: Test"
  };

  const dummyRequest: ModelRequest = {
    context: dummyContext,
  };

  beforeEach(() => {
    router = new SimpleModelRouter();
    mockProvider = new MockModelProvider();
  });

  it("should route to the only registered provider", async () => {
    router.registerProvider(mockProvider);
    const response = await router.route(dummyRequest);
    expect(response.text).toContain("Simulated response");
    expect(response.usage.promptTokens).toBe(10);
  });

  it("should throw if no providers are registered", async () => {
    await expect(router.route(dummyRequest)).rejects.toThrowError(/No model providers/);
  });

  it("should route by specific modelName", async () => {
    router.registerProvider(mockProvider);

    const specificProvider: ModelProvider = {
      name: "gpt-4",
      supportsCapabilities: () => true,
      generate: async () => ({ text: "I am GPT-4", finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } })
    };
    router.registerProvider(specificProvider);

    const request: ModelRequest = { ...dummyRequest, modelName: "gpt-4" };
    const response = await router.route(request);

    expect(response.text).toBe("I am GPT-4");
  });

  it("should route by capabilities if modelName is not found or not specified", async () => {
    // mockProvider does NOT support "vision"
    router.registerProvider(mockProvider);

    const visionProvider: ModelProvider = {
      name: "vision-model",
      supportsCapabilities: (caps) => caps.includes("vision"),
      generate: async () => ({ text: "I see things", finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } })
    };
    router.registerProvider(visionProvider);

    const response = await router.route(dummyRequest, ["vision"]);
    expect(response.text).toBe("I see things");
  });

  it("should throw if no provider supports requested capabilities", async () => {
    router.registerProvider(mockProvider); // only supports text

    await expect(router.route(dummyRequest, ["vision"])).rejects.toThrowError(/No suitable model provider/);
  });

  it("should bubble up provider generation errors", async () => {
    router.registerProvider(mockProvider);
    const errorRequest: ModelRequest = {
      context: { ...dummyContext, fullPrompt: "FAIL the generation" }
    };

    await expect(router.route(errorRequest)).rejects.toThrowError(/failed to generate response: Simulated LLM Error/);
  });
});
