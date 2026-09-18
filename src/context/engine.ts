import { CompiledContext, ContextChunk, ContextConfig, ContextEngine } from "./types.js";
import { MemoryStore } from "../memory/types.js";
import { Task, TaskExecution } from "../core/types.js";

// Naive token estimator: roughly 1 token per 4 characters.
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export class SimpleContextEngine implements ContextEngine {
  constructor(
    private memoryStore: MemoryStore,
    private config: ContextConfig = {
      maxTokens: 4000,
      relevanceThreshold: 0.5,
      includeHistory: true,
      maxHistorySteps: 5
    },
    private systemPrompt?: string
  ) {}

  async buildContext(task: Task, execution: TaskExecution, queryContext?: string): Promise<CompiledContext> {
    const chunks: ContextChunk[] = [];
    let currentTokens = 0;

    // 1. System Prompt
    if (this.systemPrompt) {
      const tokens = estimateTokens(this.systemPrompt);
      chunks.push({ source: "SYSTEM", content: this.systemPrompt, tokens, relevance: 1.0 });
      currentTokens += tokens;
    }

    // 2. Task Objective
    const taskContent = `Objective: ${task.objective}\nContext: ${task.context || "None"}`;
    const taskTokens = estimateTokens(taskContent);
    chunks.push({ source: "TASK", content: taskContent, tokens: taskTokens, relevance: 1.0 });
    currentTokens += taskTokens;

    // 3. Execution History
    if (this.config.includeHistory && execution.history.length > 0) {
      const recentHistory = execution.history.slice(-this.config.maxHistorySteps);
      const historyStrings = recentHistory.map(step =>
        `[${step.state}] Output: ${step.output || 'none'} | Error: ${step.error || 'none'}`
      );
      const historyContent = `Recent History:\n${historyStrings.join("\n")}`;
      const histTokens = estimateTokens(historyContent);

      chunks.push({ source: "HISTORY", content: historyContent, tokens: histTokens, relevance: 0.9 });
      currentTokens += histTokens;
    }

    // 4. Memory Retrieval
    const searchQuery = queryContext || task.objective;
    const memories = await this.memoryStore.search({
      contentContains: searchQuery.split(" ")[0], // extremely naive keyword search for MVP
      minRelevance: this.config.relevanceThreshold,
    });

    for (const mem of memories) {
      const memTokens = estimateTokens(mem.content);
      if (currentTokens + memTokens > this.config.maxTokens) {
        break;
      }
      chunks.push({
        source: "MEMORY",
        content: `Memory [${mem.type}]: ${mem.content}`,
        tokens: memTokens,
        relevance: mem.relevanceScore || 0.5
      });
      currentTokens += memTokens;
    }

    let fullPrompt = "";
    for (const chunk of chunks) {
      fullPrompt += `--- ${chunk.source} ---\n${chunk.content}\n\n`;
    }

    return {
      taskObjective: task.objective,
      systemPrompt: this.systemPrompt,
      chunks,
      totalTokens: currentTokens,
      fullPrompt: fullPrompt.trim()
    };
  }
}
