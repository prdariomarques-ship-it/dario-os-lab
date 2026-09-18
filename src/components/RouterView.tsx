/**
 * Model Router Matrix Component
 * Directs tasks to optimal models based on complexity, cost, latency, and context
 */

import React, { useState } from 'react';
import {
  Route,
  Sparkles,
  ArrowRight,
  DollarSign,
  Clock,
  CheckCircle2,
  Cpu,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { RouteCriteria, RoutingDecision } from '../ai/routing/types.ts';

export const RouterView: React.FC = () => {
  const [taskDescription, setTaskDescription] = useState<string>(
    'Translate customer review from Japanese to English and classify sentiment.'
  );
  const [priority, setPriority] = useState<RouteCriteria['priority']>('cost');
  const [promptTokens, setPromptTokens] = useState<number>(400);
  const [outputTokens, setOutputTokens] = useState<number>(150);
  const [requireTools, setRequireTools] = useState<boolean>(false);
  const [requireStructured, setRequireStructured] = useState<boolean>(true);
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const presets = [
    {
      label: 'Simple: Sentiment & Translation',
      task: 'Translate customer review from Japanese to English and classify sentiment.',
      promptTok: 400,
      outTok: 150,
      prio: 'cost' as const,
      tools: false,
    },
    {
      label: 'Standard: Tool Calling & DB Query',
      task: 'Query analytics database for last week DAU and calculate day-over-day growth percentage.',
      promptTok: 1200,
      outTok: 350,
      prio: 'balanced' as const,
      tools: true,
    },
    {
      label: 'Complex: Distributed Architecture & Audit',
      task: 'Perform security audit and design distributed consensus protocol architecture with formal correctness proof.',
      promptTok: 9500,
      outTok: 2000,
      prio: 'quality' as const,
      tools: true,
    },
  ];

  const applyPreset = (preset: (typeof presets)[0]) => {
    setTaskDescription(preset.task);
    setPromptTokens(preset.promptTok);
    setOutputTokens(preset.outTok);
    setPriority(preset.prio);
    setRequireTools(preset.tools);
  };

  const evaluateRoute = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/routing/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskDescription,
          estimatedPromptTokens: promptTokens,
          expectedOutputTokens: outputTokens,
          priority,
          requiredCapabilities: {
            toolCalling: requireTools,
            structuredOutput: requireStructured,
          },
        }),
      });

      const data = await res.json();
      setDecision(data);
    } catch (err) {
      console.error('Route evaluation error', err);
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
              <Route className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Dynamic Model Router
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              Never assume the most expensive model must run every task. Dynamically routes to Flash, Flash Lite, Pro, or Mock.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
              Cost & Latency Optimized
            </span>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500">Presets:</span>
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-xs px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid: Criteria Input vs Decision Result */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Criteria Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 mb-3">
              Task Criteria & Constraints
            </h3>

            <div className="mb-4">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 block mb-1">
                Task Description
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                  Optimization Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as RouteCriteria['priority'])}
                  className="w-full text-xs p-2 bg-zinc-50 border border-zinc-200 rounded-lg font-medium text-zinc-800 focus:outline-none"
                >
                  <option value="cost">Cost First (Cheapest viable)</option>
                  <option value="latency">Latency First (Fastest response)</option>
                  <option value="quality">Quality First (Deepest reasoning)</option>
                  <option value="balanced">Balanced (Optimal tradeoff)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                  Prompt / Output Tokens
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={promptTokens}
                    onChange={(e) => setPromptTokens(Number(e.target.value))}
                    className="w-1/2 text-xs p-2 bg-zinc-50 border border-zinc-200 rounded-lg font-mono"
                    title="Prompt Tokens"
                  />
                  <input
                    type="number"
                    value={outputTokens}
                    onChange={(e) => setOutputTokens(Number(e.target.value))}
                    className="w-1/2 text-xs p-2 bg-zinc-50 border border-zinc-200 rounded-lg font-mono"
                    title="Expected Output Tokens"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4 text-xs">
              <span className="text-[11px] font-semibold text-zinc-500 block">
                Required Capabilities:
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireTools}
                  onChange={(e) => setRequireTools(e.target.checked)}
                  className="rounded text-zinc-900"
                />
                <span>Requires Function / Tool Calling</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireStructured}
                  onChange={(e) => setRequireStructured(e.target.checked)}
                  className="rounded text-zinc-900"
                />
                <span>Requires Deterministic Structured Output</span>
              </label>
            </div>

            <button
              type="button"
              id="btn-evaluate-route"
              onClick={evaluateRoute}
              disabled={isLoading || !taskDescription.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-zinc-900 text-white font-medium text-xs hover:bg-zinc-800 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Evaluating Routing Heuristics...</span>
                </>
              ) : (
                <>
                  <Route className="w-3.5 h-3.5" />
                  <span>Evaluate Model Routing</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Routing Decision Matrix */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs min-h-[380px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Routing Decision & Tradeoff Analysis
                </span>
                {decision && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                    Optimal Selected
                  </span>
                )}
              </div>

              {decision ? (
                <div className="space-y-4">
                  {/* Selected Model Card */}
                  <div className="p-4 bg-zinc-900 text-white rounded-xl shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-amber-400" />
                        <h4 className="text-base font-bold tracking-tight">
                          {decision.selectedModelId}
                        </h4>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                        Tier: {decision.assessedComplexity}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed mb-4">
                      {decision.rationale}
                    </p>

                    <div className="grid grid-cols-3 gap-2 text-xs border-t border-zinc-800 pt-3">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Estimated Cost:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          ${decision.estimatedCostUsd}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Latency Tier:</span>
                        <span className="font-mono font-bold text-zinc-200 capitalize">
                          {decision.expectedLatencyTier}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Fallback Model:</span>
                        <span className="font-mono font-bold text-amber-300 truncate block">
                          {decision.fallbackModelId || 'None'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Provider Routing Comparison Table */}
                  <div>
                    <h5 className="text-xs font-bold text-zinc-700 mb-2">
                      Alternative Candidate Matrix
                    </h5>
                    <div className="border border-zinc-200 rounded-lg overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-semibold text-zinc-600">
                          <tr>
                            <th className="p-2.5">Model</th>
                            <th className="p-2.5">Best For</th>
                            <th className="p-2.5">Relative Cost</th>
                            <th className="p-2.5">Latency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 text-zinc-700">
                          <tr className={decision.selectedModelId === 'gemini-3.1-flash-lite' ? 'bg-amber-50/60 font-semibold' : ''}>
                            <td className="p-2.5">gemini-3.1-flash-lite</td>
                            <td className="p-2.5">Simple QA, translation, extraction</td>
                            <td className="p-2.5 text-emerald-700">$0.000075 / 1k</td>
                            <td className="p-2.5">Ultra-low (~80ms)</td>
                          </tr>
                          <tr className={decision.selectedModelId === 'gemini-3.8-flash' ? 'bg-amber-50/60 font-semibold' : ''}>
                            <td className="p-2.5">gemini-3.8-flash</td>
                            <td className="p-2.5">Standard agent loops, tool calling</td>
                            <td className="p-2.5 text-zinc-600">$0.00015 / 1k</td>
                            <td className="p-2.5">Low (~200ms)</td>
                          </tr>
                          <tr className={decision.selectedModelId === 'gemini-3.1-pro-preview' ? 'bg-amber-50/60 font-semibold' : ''}>
                            <td className="p-2.5">gemini-3.1-pro-preview</td>
                            <td className="p-2.5">Deep reasoning, STEM, coding</td>
                            <td className="p-2.5 text-zinc-600">$0.00125 / 1k</td>
                            <td className="p-2.5">Medium (~600ms)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                  <Route className="w-8 h-8 text-zinc-300 mb-2" />
                  <p className="text-xs">No routing evaluation run yet.</p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Select a preset or enter a task description, then click "Evaluate Model Routing".
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
