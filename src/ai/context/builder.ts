/**
 * DARIUS OSS - Context Engineering Builder
 * Assembles modular context layers with strict budget enforcement and zero monolithic prompt leakage.
 */

import { ChatMessage, ToolDefinition } from '../types.ts';
import {
  AssembledContext,
  ContextBudget,
  ContextLayerType,
  ExecutionHistoryStep,
  MemoryEntry,
  ObservationEntry,
  TaskContext,
} from './types.ts';

export class ContextBuilder {
  private systemInstructions: string[] = [];
  private taskContext?: TaskContext;
  private memories: MemoryEntry[] = [];
  private tools: ToolDefinition[] = [];
  private observations: ObservationEntry[] = [];
  private executionHistory: ExecutionHistoryStep[] = [];

  constructor() {
    this.reset();
  }

  public reset(): this {
    this.systemInstructions = [
      'You are DARIUS OSS AI Agent Runtime.',
      'Operate under strict safety, verified tool usage, and bounded autonomy rules.',
      'Always prioritize deterministic structured reasoning over ambiguous free-form speculation.',
      'Never execute unapproved destructive actions.',
    ];
    this.taskContext = undefined;
    this.memories = [];
    this.tools = [];
    this.observations = [];
    this.executionHistory = [];
    return this;
  }

  public setSystemInstruction(instruction: string): this {
    this.systemInstructions = [instruction];
    return this;
  }

  public appendSystemInstruction(instruction: string): this {
    this.systemInstructions.push(instruction);
    return this;
  }

  public setTaskContext(task: TaskContext): this {
    this.taskContext = task;
    return this;
  }

  public addMemory(memory: MemoryEntry): this {
    this.memories.push(memory);
    return this;
  }

  public setMemories(memories: MemoryEntry[]): this {
    this.memories = [...memories];
    return this;
  }

  public setTools(tools: ToolDefinition[]): this {
    this.tools = [...tools];
    return this;
  }

  public addObservation(observation: ObservationEntry): this {
    this.observations.push(observation);
    return this;
  }

  public addExecutionHistory(step: ExecutionHistoryStep): this {
    this.executionHistory.push(step);
    return this;
  }

  private estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  }

  /**
   * Assembles the multi-layered prompt with token budgeting and prioritization
   */
  public build(
    budget: ContextBudget = { maxTotalTokens: 16384, reservedForOutput: 2048 }
  ): AssembledContext {
    const availableInputTokens = Math.max(512, budget.maxTotalTokens - budget.reservedForOutput);
    const truncatedLayers: ContextLayerType[] = [];

    // 1. Layer: System Instructions (Immutable priority)
    const systemText = this.systemInstructions.join('\n\n');
    const systemTokens = this.estimateTokens(systemText);

    // 2. Layer: Task Context (High priority)
    let taskText = '';
    if (this.taskContext) {
      taskText = [
        `## ACTIVE TASK CONTEXT`,
        `Objective: ${this.taskContext.goal}`,
        this.taskContext.constraints && this.taskContext.constraints.length > 0
          ? `Constraints:\n${this.taskContext.constraints.map((c) => `- ${c}`).join('\n')}`
          : '',
        this.taskContext.maxBudgetUsd ? `Cost Budget: $${this.taskContext.maxBudgetUsd}` : '',
        `Session ID: ${this.taskContext.sessionId}`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    const taskTokens = this.estimateTokens(taskText);

    // 3. Layer: Relevant Memory
    let memoryText = '';
    if (this.memories.length > 0) {
      // Sort by relevance if present
      const sortedMemories = [...this.memories].sort(
        (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
      );
      memoryText = [
        `## RELEVANT RETRIEVED MEMORY`,
        ...sortedMemories.map(
          (m, idx) => `[Mem-${idx + 1} (${m.source}${m.relevanceScore ? ` rel:${m.relevanceScore}` : ''})]: ${m.content}`
        ),
      ].join('\n');
    }
    const memoryTokens = this.estimateTokens(memoryText);

    // 4. Layer: Tool Definitions summary
    let toolsSummaryText = '';
    if (this.tools.length > 0) {
      toolsSummaryText = [
        `## REGISTERED TOOLS`,
        ...this.tools.map(
          (t) => `- \`${t.name}\`: ${t.description} (params: ${Object.keys(t.parameters.properties || {}).join(', ')})`
        ),
      ].join('\n');
    }
    const toolsTokens = this.estimateTokens(toolsSummaryText);

    // 5. Layer: Execution History (Recent thought/action chain)
    let historyText = '';
    if (this.executionHistory.length > 0) {
      historyText = [
        `## EXECUTION TRAIL`,
        ...this.executionHistory.map(
          (h) => `Step ${h.stepIndex}:
  Thought: ${h.thought}
  Action: ${h.actionTaken}
  Outcome: ${h.outcomeSummary}`
        ),
      ].join('\n\n');
    }
    let historyTokens = this.estimateTokens(historyText);

    // 6. Layer: Observations (Fresh tool results)
    let observationsText = '';
    if (this.observations.length > 0) {
      observationsText = [
        `## LATEST OBSERVATIONS`,
        ...this.observations.map(
          (o) => `Observation [Step ${o.stepIndex} - ${o.toolName}]:
  Args: ${JSON.stringify(o.args)}
  Status: ${o.isError ? 'FAILED' : 'SUCCESS'}
  Result: ${typeof o.result === 'object' ? JSON.stringify(o.result) : o.result}`
        ),
      ].join('\n\n');
    }
    let observationTokens = this.estimateTokens(observationsText);

    // Budget calculation & safe truncation
    let totalEstimated = systemTokens + taskTokens + memoryTokens + toolsTokens + historyTokens + observationTokens;

    // If exceeding budget, truncate execution history first, then observations, then memories
    if (totalEstimated > availableInputTokens) {
      if (historyTokens > 1000) {
        truncatedLayers.push('execution_history');
        // Keep only last 2 history steps
        const slicedHistory = this.executionHistory.slice(-2);
        historyText = `## EXECUTION TRAIL (Truncated to last ${slicedHistory.length} steps)\n` +
          slicedHistory.map((h) => `Step ${h.stepIndex}: ${h.actionTaken} -> ${h.outcomeSummary}`).join('\n');
        historyTokens = this.estimateTokens(historyText);
      }

      totalEstimated = systemTokens + taskTokens + memoryTokens + toolsTokens + historyTokens + observationTokens;
      if (totalEstimated > availableInputTokens && observationTokens > 1000) {
        truncatedLayers.push('observations');
        const slicedObs = this.observations.slice(-2);
        observationsText = `## LATEST OBSERVATIONS (Truncated)\n` +
          slicedObs.map((o) => `[${o.toolName}]: ${JSON.stringify(o.result).slice(0, 300)}`).join('\n');
        observationTokens = this.estimateTokens(observationsText);
      }
    }

    // Compose user message containing modular sections
    const userPromptSections = [
      taskText,
      memoryText,
      toolsSummaryText,
      historyText,
      observationsText,
      `\nReview the active goal and latest observations. Formulate your structured decision now.`,
    ].filter(Boolean);

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: userPromptSections.join('\n\n'),
      },
    ];

    return {
      systemInstruction: systemText,
      messages,
      tools: this.tools,
      tokenEstimate: {
        total: systemTokens + taskTokens + memoryTokens + toolsTokens + historyTokens + observationTokens,
        breakdown: {
          system_instructions: systemTokens,
          task_context: taskTokens,
          memory: memoryTokens,
          tools: toolsTokens,
          execution_history: historyTokens,
          observations: observationTokens,
        },
      },
      truncatedLayers,
    };
  }
}
