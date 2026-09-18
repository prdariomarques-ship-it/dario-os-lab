/**
 * Agent Reasoning Loop Component
 * Visualizes deterministic multi-step reasoning, iteration limits, loop breakers, and structured decisions
 */

import React, { useState } from 'react';
import {
  Zap,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  Layers,
  ArrowRight,
  ShieldAlert,
  Braces,
  RotateCcw,
} from 'lucide-react';
import { ReasoningExecutionResult } from '../ai/reasoning/types.ts';

interface ReasoningViewProps {
  activeProvider: string;
}

export const ReasoningView: React.FC<ReasoningViewProps> = ({ activeProvider }) => {
  const [goal, setGoal] = useState<string>(
    'Investigate customer report: payment checkout returning 500 error on USD transactions.'
  );
  const [maxSteps, setMaxSteps] = useState<number>(4);
  const [maxCostUsd, setMaxCostUsd] = useState<number>(0.05);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ReasoningExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runReasoningLoop = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/ai/reasoning/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          modelId: activeProvider,
          config: {
            maxSteps,
            maxCostUsd,
            stopOnFirstError: false,
          },
          tools: [
            {
              name: 'web_search',
              description: 'Searches knowledge base or web documentation',
              parameters: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
            {
              name: 'calculator',
              description: 'Performs arithmetic calculation',
              parameters: {
                type: 'object',
                properties: { expression: { type: 'string' } },
                required: ['expression'],
              },
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute reasoning task');
      }

      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 py-6">
      {/* Overview Banner */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Bounded Agent Reasoning Loop
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              Iterative Plan-Act-Observe-Reflect cycles using deterministic JSON schemas and hard step caps.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Hard Iteration Cap: Max 10 Steps
            </span>
          </div>
        </div>

        {/* Guardrails Pill row */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-2.5">
            <Braces className="w-4 h-4 text-zinc-600 shrink-0" />
            <div>
              <span className="font-bold text-zinc-900 block">Structured Schema</span>
              <span className="text-zinc-500 text-[11px]">Enforces AgentDecision JSON</span>
            </div>
          </div>
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-2.5">
            <RotateCcw className="w-4 h-4 text-zinc-600 shrink-0" />
            <div>
              <span className="font-bold text-zinc-900 block">Loop Breaker</span>
              <span className="text-zinc-500 text-[11px]">Halts repetitive tool calls</span>
            </div>
          </div>
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-zinc-600 shrink-0" />
            <div>
              <span className="font-bold text-zinc-900 block">Bounded Autonomy</span>
              <span className="text-zinc-500 text-[11px]">Ceiling on steps & budget</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Controls & Run Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Setup & Configuration */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 mb-3">
              Task Configuration
            </h3>

            <div className="mb-4">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 block mb-1">
                Agent Goal
              </label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-800 font-sans"
                placeholder="Describe the task for the reasoning loop..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                  Max Steps Ceiling
                </label>
                <select
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  className="w-full text-xs p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none font-medium text-zinc-800"
                >
                  <option value={2}>2 steps (Fast verification)</option>
                  <option value={3}>3 steps (Standard task)</option>
                  <option value={5}>5 steps (Multi-step)</option>
                  <option value={8}>8 steps (Deep reasoning)</option>
                  <option value={10}>10 steps (Strict max limit)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                  Cost Ceiling (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={maxCostUsd}
                  onChange={(e) => setMaxCostUsd(Number(e.target.value))}
                  className="w-full text-xs p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none font-medium text-zinc-800"
                />
              </div>
            </div>

            <button
              type="button"
              id="btn-run-reasoning"
              onClick={runReasoningLoop}
              disabled={isLoading || !goal.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-zinc-900 text-white font-medium text-xs hover:bg-zinc-800 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Executing Reasoning Loop...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Bounded Reasoning</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Execution Steps & Results */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs min-h-[420px] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  Execution Steps & Telemetry
                </span>
              </div>

              {result && (
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    {result.totalLatencyMs}ms
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    {result.totalTokens} tokens
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                    ${result.totalCostUsd}
                  </span>
                </div>
              )}
            </div>

            {error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>Reasoning Execution Error</span>
                </div>
                <p className="font-mono text-[11px]">{error}</p>
                <p className="text-[11px] text-red-600 mt-2">
                  Switch to <strong>DARIUS Local Mock Provider</strong> to verify the reasoning loop logic offline.
                </p>
              </div>
            ) : result ? (
              <div className="space-y-4 flex-1 overflow-auto max-h-[550px] pr-1">
                {/* Status Summary Banner */}
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    result.status === 'completed'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold capitalize">
                      Status: {result.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono">
                    Steps: {result.steps.length} / {maxSteps}
                  </span>
                </div>

                {/* Step Cards */}
                <div className="space-y-3">
                  {result.steps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="border border-zinc-200 rounded-lg p-3 bg-zinc-50/70 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-200/60 pb-1.5">
                        <span className="font-bold text-zinc-900">
                          Step #{step.stepNumber}
                        </span>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 font-mono">
                            {step.decision.nextAction}
                          </span>
                          <span className="text-zinc-500 font-mono">
                            conf: {(step.decision.confidence * 100).toFixed(0)}%
                          </span>
                          <span className="text-zinc-400 font-mono">
                            {step.durationMs}ms
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 text-[11px] block font-medium">Thought:</span>
                        <p className="text-zinc-800 text-[11px] italic">"{step.decision.thought}"</p>
                      </div>

                      {step.decision.toolCall && (
                        <div className="p-2 bg-white rounded border border-zinc-200 text-[11px]">
                          <span className="font-bold text-indigo-700">
                            Invoking Tool: {step.decision.toolCall.toolName}
                          </span>
                          <pre className="font-mono text-[10px] text-zinc-600 mt-1">
                            {JSON.stringify(step.decision.toolCall.parameters, null, 2)}
                          </pre>
                        </div>
                      )}

                      {step.toolResult !== undefined && (
                        <div className="p-2 bg-emerald-50/60 rounded border border-emerald-200/80 text-[11px]">
                          <span className="font-bold text-emerald-800">
                            Observation Result:
                          </span>
                          <pre className="font-mono text-[10px] text-zinc-700 mt-0.5">
                            {JSON.stringify(step.toolResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Final Synthesized Output */}
                {result.finalOutput && (
                  <div className="p-3 bg-zinc-900 text-zinc-100 rounded-lg text-xs space-y-1">
                    <span className="font-bold text-amber-400 text-[11px] uppercase tracking-wider block">
                      Final Output:
                    </span>
                    <p className="leading-relaxed">{result.finalOutput}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                <Zap className="w-8 h-8 text-zinc-300 mb-2" />
                <p className="text-xs">No active reasoning execution.</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Configure a goal and click "Start Bounded Reasoning" to watch the agent think and act.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
