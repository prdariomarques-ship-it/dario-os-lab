/**
 * DARIUS OSS - Bounded Reasoning Engine
 * Orchestrates multi-step reasoning with strict iteration caps, structured decisions, and safety boundaries.
 */

import { ContextBuilder } from '../context/builder.ts';
import { Model, StructuredOutputSchema, ToolDefinition } from '../types.ts';
import {
  AgentDecision,
  ReasoningExecutionConfig,
  ReasoningExecutionResult,
  ReasoningStepRecord,
} from './types.ts';

export const AgentDecisionSchema: StructuredOutputSchema<AgentDecision> = {
  name: 'AgentDecision',
  description: 'Deterministic structured decision for an agent reasoning step',
  schema: {
    type: 'OBJECT',
    properties: {
      thought: {
        type: 'STRING',
        description: 'Internal analytical reasoning about the task, context, and observations',
      },
      stateAssessment: {
        type: 'STRING',
        description: 'Assessment of current progress towards the objective',
      },
      progressPercentage: {
        type: 'INTEGER',
        description: 'Estimated progress between 0 and 100',
      },
      nextAction: {
        type: 'STRING',
        enum: ['call_tool', 'ask_user', 'finish', 'reflect'],
        description: 'The selected operational action for this step',
      },
      toolCall: {
        type: 'OBJECT',
        description: 'Required if nextAction is call_tool',
        properties: {
          toolName: { type: 'STRING' },
          parameters: { type: 'OBJECT' },
          expectedOutcome: { type: 'STRING' },
        },
      },
      finalAnswer: {
        type: 'STRING',
        description: 'Final formulated answer if nextAction is finish',
      },
      reflectionPrompt: {
        type: 'STRING',
        description: 'Self-critique question if nextAction is reflect',
      },
      confidence: {
        type: 'NUMBER',
        description: 'Confidence score from 0.0 to 1.0',
      },
    },
    required: ['thought', 'stateAssessment', 'progressPercentage', 'nextAction', 'confidence'],
  },
  validator: (data: unknown): data is AgentDecision => {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
      typeof d.thought === 'string' &&
      typeof d.stateAssessment === 'string' &&
      typeof d.nextAction === 'string' &&
      ['call_tool', 'ask_user', 'finish', 'reflect'].includes(d.nextAction)
    );
  },
};

export type ToolExecutor = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export class ReasoningEngine {
  private model: Model;
  private toolExecutor: ToolExecutor;
  private registeredTools: ToolDefinition[] = [];

  constructor(
    model: Model,
    toolExecutor: ToolExecutor = async (name) => ({ status: 'executed', tool: name }),
    tools: ToolDefinition[] = []
  ) {
    this.model = model;
    this.toolExecutor = toolExecutor;
    this.registeredTools = tools;
  }

  public setModel(model: Model): void {
    this.model = model;
  }

  public setTools(tools: ToolDefinition[]): void {
    this.registeredTools = tools;
  }

  /**
   * Executes the bounded reasoning loop with hard stop conditions
   */
  public async executeTask(
    goal: string,
    contextBuilder: ContextBuilder,
    config: ReasoningExecutionConfig = { maxSteps: 5 }
  ): Promise<ReasoningExecutionResult> {
    const sessionId = `session_${Date.now()}`;
    const startTime = Date.now();
    const steps: ReasoningStepRecord[] = [];
    const maxSteps = Math.min(config.maxSteps || 5, 10); // Hard maximum 10 steps

    let totalTokens = 0;
    let totalCostUsd = 0;
    let finalOutput: string | undefined;
    let status: ReasoningExecutionResult['status'] = 'completed';
    let errorMessage: string | undefined;

    // Track repeated actions to break loops
    const toolCallSignatures: string[] = [];

    contextBuilder.setTools(this.registeredTools);

    for (let stepNumber = 1; stepNumber <= maxSteps; stepNumber++) {
      const stepStartTime = Date.now();

      // Check timeout
      if (config.timeoutMs && Date.now() - startTime > config.timeoutMs) {
        status = 'error';
        errorMessage = `Execution timed out after ${config.timeoutMs}ms`;
        break;
      }

      // Check budget
      if (config.maxCostUsd && totalCostUsd >= config.maxCostUsd) {
        status = 'budget_exceeded';
        errorMessage = `Cost ceiling of $${config.maxCostUsd} reached`;
        break;
      }

      // 1. Build assembled context with budget control
      const assembled = contextBuilder.build();

      // 2. Query model for deterministic structured decision
      let decision: AgentDecision;
      try {
        decision = await this.model.structuredOutput<AgentDecision>(
          assembled.messages,
          AgentDecisionSchema
        );
      } catch (err: unknown) {
        // Fallback: try raw generate and parse or synthesize
        const rawErr = err instanceof Error ? err.message : String(err);
        try {
          const gen = await this.model.generate(assembled.messages);
          decision = {
            thought: gen.text.slice(0, 300),
            stateAssessment: 'Extracted from fallback generation',
            progressPercentage: 50,
            nextAction: 'finish',
            finalAnswer: gen.text,
            confidence: 0.7,
          };
          totalTokens += gen.usage.totalTokens;
        } catch (innerErr) {
          status = 'error';
          errorMessage = `Reasoning step ${stepNumber} failed: ${rawErr}`;
          break;
        }
      }

      // Estimate tokens for step
      const stepTokens = {
        promptTokens: assembled.tokenEstimate.total,
        completionTokens: Math.ceil(JSON.stringify(decision).length / 4),
        totalTokens: assembled.tokenEstimate.total + Math.ceil(JSON.stringify(decision).length / 4),
      };
      totalTokens += stepTokens.totalTokens;

      const caps = this.model.capabilities();
      totalCostUsd +=
        (stepTokens.promptTokens / 1000) * caps.costPer1kInputTokensUsd +
        (stepTokens.completionTokens / 1000) * caps.costPer1kOutputTokensUsd;

      // Handle loop detection
      if (decision.nextAction === 'call_tool' && decision.toolCall) {
        const signature = `${decision.toolCall.toolName}:${JSON.stringify(decision.toolCall.parameters)}`;
        if (toolCallSignatures.filter((s) => s === signature).length >= 2) {
          // Loop detected: break cycle
          decision.thought += ' [Warning: repetitive tool invocation detected. Breaking execution loop.]';
          decision.nextAction = 'finish';
          decision.finalAnswer = `Execution loop interrupted: repeated tool invocation for ${decision.toolCall.toolName}`;
        } else {
          toolCallSignatures.push(signature);
        }
      }

      // Execute action
      let toolResult: unknown;
      if (decision.nextAction === 'call_tool' && decision.toolCall) {
        try {
          toolResult = await this.toolExecutor(
            decision.toolCall.toolName,
            decision.toolCall.parameters || {}
          );

          // Feed observation back to context builder
          contextBuilder.addObservation({
            stepIndex: stepNumber,
            toolName: decision.toolCall.toolName,
            args: decision.toolCall.parameters || {},
            result: toolResult,
            timestamp: Date.now(),
          });
        } catch (toolErr: unknown) {
          const errStr = toolErr instanceof Error ? toolErr.message : String(toolErr);
          toolResult = { error: errStr };
          contextBuilder.addObservation({
            stepIndex: stepNumber,
            toolName: decision.toolCall.toolName,
            args: decision.toolCall.parameters || {},
            result: { error: errStr },
            isError: true,
            timestamp: Date.now(),
          });

          if (config.stopOnFirstError) {
            status = 'error';
            errorMessage = `Tool execution failed: ${errStr}`;
            steps.push({
              stepNumber,
              decision,
              toolResult,
              durationMs: Date.now() - stepStartTime,
              tokenUsage: stepTokens,
            });
            break;
          }
        }
      }

      // Add to execution history
      contextBuilder.addExecutionHistory({
        stepIndex: stepNumber,
        thought: decision.thought,
        actionTaken:
          decision.nextAction === 'call_tool' && decision.toolCall
            ? `call ${decision.toolCall.toolName}`
            : decision.nextAction,
        outcomeSummary:
          decision.nextAction === 'finish'
            ? 'Task completed with final answer'
            : decision.nextAction === 'call_tool'
              ? 'Tool executed and returned observation'
              : `Selected ${decision.nextAction}`,
      });

      steps.push({
        stepNumber,
        decision,
        toolResult,
        durationMs: Date.now() - stepStartTime,
        tokenUsage: stepTokens,
      });

      // Terminal conditions
      if (decision.nextAction === 'finish') {
        finalOutput = decision.finalAnswer || decision.thought;
        status = 'completed';
        break;
      }

      if (decision.nextAction === 'ask_user') {
        finalOutput = decision.thought;
        status = 'user_input_required';
        break;
      }

      if (stepNumber === maxSteps) {
        status = 'max_steps_reached';
        finalOutput = decision.finalAnswer || `Completed maximum allowed steps (${maxSteps}). Last state: ${decision.stateAssessment}`;
      }
    }

    return {
      sessionId,
      goal,
      status,
      finalOutput,
      steps,
      totalLatencyMs: Date.now() - startTime,
      totalTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      error: errorMessage,
    };
  }
}
