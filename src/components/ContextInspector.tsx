/**
 * Context Engineering Layer Inspector
 * Explicit modularization of prompt layers with live token budgeting
 */

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Terminal,
  Database,
  Wrench,
  Eye,
  History,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Sliders,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ContextBuilder } from '../ai/context/builder.ts';
import { MemoryEntry, ObservationEntry, ExecutionHistoryStep } from '../ai/context/types.ts';
import { MemoryInspector } from './MemoryInspector.tsx';

export const ContextInspector: React.FC = () => {
  const [subTab, setSubTab] = useState<'composer' | 'memory'>('composer');
  const [systemInstruction, setSystemInstruction] = useState<string>(
    'You are DARIUS OSS AI Agent Runtime. Operate under strict safety, verified tool usage, and bounded autonomy rules.'
  );

  const [taskGoal, setTaskGoal] = useState<string>(
    'Diagnose latency spike in payments gateway and report root cause.'
  );
  const [taskConstraints, setTaskConstraints] = useState<string[]>([
    'Do not restart production services without approval',
    'Limit queries to past 2 hours',
  ]);

  const [memories, setMemories] = useState<MemoryEntry[]>([
    {
      id: 'mem-01',
      source: 'semantic_search',
      content: 'Gateway timeout configuration is 5000ms at reverse proxy tier.',
      relevanceScore: 0.94,
    },
    {
      id: 'mem-02',
      source: 'workspace_kv',
      content: 'Last deployment deployed build #8421 on payment-service.',
      relevanceScore: 0.88,
    },
  ]);

  const [observations, setObservations] = useState<ObservationEntry[]>([
    {
      stepIndex: 1,
      toolName: 'query_metrics',
      args: { service: 'payment-service', metric: 'p99_latency_ms' },
      result: { current: 5400, baseline: 210, anomaly_detected: true },
      timestamp: Date.now() - 60000,
    },
  ]);

  const [history, setHistory] = useState<ExecutionHistoryStep[]>([
    {
      stepIndex: 1,
      thought: 'Identified abnormal p99 latency in payment service; need to inspect database connection pool.',
      actionTaken: 'call query_metrics',
      outcomeSummary: 'p99 latency reported at 5400ms exceeding 5000ms SLA.',
    },
  ]);

  const [maxBudgetTokens, setMaxBudgetTokens] = useState<number>(4096);
  const [activeLayer, setActiveLayer] = useState<string>('all');

  // Build context using ContextBuilder
  const assembled = useMemo(() => {
    const builder = new ContextBuilder();
    builder.setSystemInstruction(systemInstruction);
    builder.setTaskContext({
      goal: taskGoal,
      constraints: taskConstraints,
      sessionId: 'session_demo_01',
    });
    builder.setMemories(memories);
    builder.setTools([
      {
        name: 'query_metrics',
        description: 'Queries telemetry time-series database',
        parameters: {
          type: 'object',
          properties: { service: { type: 'string' }, metric: { type: 'string' } },
        },
      },
      {
        name: 'inspect_logs',
        description: 'Searches application log stream',
        parameters: {
          type: 'object',
          properties: { filter: { type: 'string' }, limit: { type: 'number' } },
        },
      },
    ]);
    for (const obs of observations) {
      builder.addObservation(obs);
    }
    for (const h of history) {
      builder.addExecutionHistory(h);
    }

    return builder.build({
      maxTotalTokens: maxBudgetTokens,
      reservedForOutput: 1024,
    });
  }, [systemInstruction, taskGoal, taskConstraints, memories, observations, history, maxBudgetTokens]);

  const tokenBreakdown = assembled.tokenEstimate.breakdown;
  const totalTokens = assembled.tokenEstimate.total;
  const budgetUsagePercent = Math.min(100, Math.round((totalTokens / maxBudgetTokens) * 100));

  const addMemory = () => {
    const newMem: MemoryEntry = {
      id: `mem-${Date.now()}`,
      source: 'semantic_search',
      content: 'Database connection pool max limit is configured to 20 connections.',
      relevanceScore: 0.91,
    };
    setMemories([...memories, newMem]);
  };

  const removeMemory = (id: string) => {
    setMemories(memories.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-6 py-6">
      {/* Header Info */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-5 h-5 text-zinc-800" />
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Context Engineering & Layer Composition
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              Strict multi-tier prompt composition separating System, Task, Memory, Tools, History, and Observations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg text-xs">
              <Sliders className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-500">Max Budget:</span>
              <select
                value={maxBudgetTokens}
                onChange={(e) => setMaxBudgetTokens(Number(e.target.value))}
                className="bg-transparent font-semibold text-zinc-800 focus:outline-none"
              >
                <option value={2048}>2,048 tokens</option>
                <option value={4096}>4,096 tokens</option>
                <option value={8192}>8,192 tokens</option>
                <option value={16384}>16,384 tokens</option>
              </select>
            </div>
          </div>
        </div>

        {/* Live Token Budget Allocation Bar */}
        <div className="mt-6 pt-5 border-t border-zinc-100">
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-zinc-700">Context Window Allocation:</span>
              <span className="font-bold text-zinc-900">
                {totalTokens} / {maxBudgetTokens} tokens ({budgetUsagePercent}%)
              </span>
            </div>
            {assembled.truncatedLayers.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Safely Truncated: {assembled.truncatedLayers.join(', ')}</span>
              </span>
            )}
          </div>

          {/* Segmented Progress Bar */}
          <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden flex border border-zinc-200">
            <div
              style={{ width: `${(tokenBreakdown.system_instructions / maxBudgetTokens) * 100}%` }}
              className="bg-indigo-500 h-full"
              title={`System: ${tokenBreakdown.system_instructions} tok`}
            />
            <div
              style={{ width: `${(tokenBreakdown.task_context / maxBudgetTokens) * 100}%` }}
              className="bg-sky-500 h-full"
              title={`Task: ${tokenBreakdown.task_context} tok`}
            />
            <div
              style={{ width: `${(tokenBreakdown.memory / maxBudgetTokens) * 100}%` }}
              className="bg-emerald-500 h-full"
              title={`Memory: ${tokenBreakdown.memory} tok`}
            />
            <div
              style={{ width: `${(tokenBreakdown.tools / maxBudgetTokens) * 100}%` }}
              className="bg-amber-500 h-full"
              title={`Tools: ${tokenBreakdown.tools} tok`}
            />
            <div
              style={{ width: `${(tokenBreakdown.execution_history / maxBudgetTokens) * 100}%` }}
              className="bg-purple-500 h-full"
              title={`History: ${tokenBreakdown.execution_history} tok`}
            />
            <div
              style={{ width: `${(tokenBreakdown.observations / maxBudgetTokens) * 100}%` }}
              className="bg-rose-500 h-full"
              title={`Observations: ${tokenBreakdown.observations} tok`}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-zinc-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              System ({tokenBreakdown.system_instructions} tok)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              Task ({tokenBreakdown.task_context} tok)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Memory ({tokenBreakdown.memory} tok)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Tools ({tokenBreakdown.tools} tok)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              History ({tokenBreakdown.execution_history} tok)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Observations ({tokenBreakdown.observations} tok)
            </span>
          </div>
        </div>

        {/* Sub-view Navigation Tabs */}
        <div className="mt-5 pt-4 border-t border-zinc-100 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('composer')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              subTab === 'composer'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Layer Composer & Prompt Assembler</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('memory')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              subTab === 'memory'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>Memory Subsystem & Retrieval Engine</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
              Interactive
            </span>
          </button>
        </div>
      </div>

      {/* Main View Body */}
      {subTab === 'memory' ? (
        <MemoryInspector
          defaultTaskGoal={taskGoal}
          onApplyMemoriesToContext={(entries) => {
            setMemories(entries);
            setSubTab('composer');
          }}
        />
      ) : (
        /* Layer Editors & Live Prompt Inspection Grid */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Layer Controls */}
        <div className="lg:col-span-6 space-y-4">
          {/* Layer 1: System Instructions */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Layer 1: System Instructions
                </span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                {tokenBreakdown.system_instructions} tokens
              </span>
            </div>
            <textarea
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              rows={2}
              className="w-full text-xs font-mono p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </div>

          {/* Layer 2: Task Context */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Layer 2: Task Context & Constraints
                </span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                {tokenBreakdown.task_context} tokens
              </span>
            </div>
            <input
              type="text"
              value={taskGoal}
              onChange={(e) => setTaskGoal(e.target.value)}
              className="w-full text-xs font-medium p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg mb-2 focus:outline-none focus:ring-1 focus:ring-zinc-800"
              placeholder="Task goal..."
            />
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-zinc-500">Constraints:</span>
              {taskConstraints.map((c, i) => (
                <div key={i} className="text-xs bg-zinc-50 px-2 py-1 rounded text-zinc-700 border border-zinc-200">
                  • {c}
                </div>
              ))}
            </div>
          </div>

          {/* Layer 3: Memory */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Layer 3: Relevant Memory ({memories.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-400">
                  {tokenBreakdown.memory} tokens
                </span>
                <button
                  type="button"
                  onClick={() => setSubTab('memory')}
                  className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                >
                  <Database className="w-3 h-3" /> Engine
                </button>
                <button
                  type="button"
                  onClick={addMemory}
                  className="flex items-center gap-1 text-[11px] font-semibold text-zinc-700 hover:text-zinc-900"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2 rounded bg-zinc-50 border border-zinc-200 text-xs"
                >
                  <div className="flex-1 pr-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono uppercase bg-emerald-100 text-emerald-800 px-1 rounded">
                        {m.source}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        rel: {m.relevanceScore}
                      </span>
                    </div>
                    <p className="text-zinc-800 font-mono text-[11px]">{m.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMemory(m.id)}
                    className="text-zinc-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Layer 5 & 6: History & Observations */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Layers 5 & 6: Observations & History
                </span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                {tokenBreakdown.observations + tokenBreakdown.execution_history} tokens
              </span>
            </div>
            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>Step 1: query_metrics</span>
                <span className="text-emerald-700 font-medium">Observation OK</span>
              </div>
              <pre className="text-[10px] font-mono text-zinc-700 bg-white p-2 rounded border border-zinc-200 overflow-x-auto">
                {JSON.stringify(observations[0]?.result || {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Right Column: Assembled Final Prompt View */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col h-full min-h-[500px]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-zinc-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  Assembled Prompt Inspection
                </span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                Total: ~{totalTokens} tokens
              </span>
            </div>

            <div className="flex-1 space-y-4 text-xs font-mono overflow-auto max-h-[600px] scrollbar-none pr-1">
              <div>
                <span className="text-[11px] font-bold uppercase text-indigo-700 block mb-1">
                  [SYSTEM INSTRUCTION]
                </span>
                <div className="p-3 bg-indigo-50/50 border border-indigo-200/70 rounded-lg text-indigo-950 whitespace-pre-wrap">
                  {assembled.systemInstruction}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase text-zinc-700 block mb-1">
                  [USER PROMPT - ASSEMBLED LAYERS]
                </span>
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 whitespace-pre-wrap leading-relaxed">
                  {assembled.messages[0]?.content || ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
};
