import { ModelProvider, ModelRequest, ModelResponse } from "./types.js";

// A mock provider to be used in testing the TS Core before wiring real external APIs like Ollama/Claude.
export class MockModelProvider implements ModelProvider {
  public name = "mock-llm";

  supportsCapabilities(caps: string[]): boolean {
    return !caps.includes("vision");
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const promptLen = request.context.fullPrompt.length;

    // Simulate generation time based on context size
    await new Promise(r => setTimeout(r, 10));

    let responseText = "Simulated response based on context.";
    if (request.context.fullPrompt.includes("FAIL")) {
      throw new Error("Simulated LLM Error");
    }

    // ACT phase generation vs THINK phase generation heuristic
    // For tests, if the compiled context includes the objective 'DONE',
    // we make the model output DONE to finish the loop, but only when it is making an "action" request
    if (request.context.taskObjective.includes("DONE")) {
       // Check if this is the "act" phase explicitly using temperature heuristic or fullPrompt
       if (request.temperature === 0.2 || request.context.fullPrompt.includes("action")) {
          responseText = "DONE: Task complete";
       }
    }

    const completionTokens = Math.ceil(responseText.length / 4);

    return {
      text: responseText,
      finishReason: "stop",
      usage: {
        promptTokens: request.context.totalTokens,
        completionTokens: completionTokens,
        totalTokens: request.context.totalTokens + completionTokens
      }
    };
  }
}
