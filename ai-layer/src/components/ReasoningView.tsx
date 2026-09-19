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
  ShieldAlert,
  Braces,
  RotateCcw,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { ReasoningExecutionResult } from '../ai/reasoning/types.ts';
import { BUILTIN_TOOLS } from '../ai/tools/registry.ts';
import { useLanguage } from '../context/LanguageContext.tsx';

interface ReasoningViewProps {
  activeProvider: string;
}

export const ReasoningView: React.FC<ReasoningViewProps> = ({ activeProvider }) => {
  const { language } = useLanguage();
  const isPt = language === 'pt';

  const PRESETS = [
    {
      label: isPt ? 'Investigação de Incidente 500' : 'Incident 500 Investigation',
      goal: isPt
        ? 'Investigar erro 500 intermitente no checkout de pagamentos em transações USD e sugerir mitigação.'
        : 'Investigate customer report: payment checkout returning 500 error on USD transactions.',
    },
    {
      label: isPt ? 'Cálculo Financeiro & ROI' : 'Cost & ROI Calculation',
      goal: isPt
        ? 'Calcule o ROI e o custo de 6 nós de inferência a $180/mês cada com 12% de desconto corporativo.'
        : 'Calculate the annual cost of 6 inference nodes at $180/month each with a 12% corporate discount and summarize the budget.',
    },
    {
      label: isPt ? 'Diagnóstico de Métricas' : 'System Metrics & Health',
      goal: isPt
        ? 'Verifique a hora atual e as métricas de saúde e memória do sistema para auditoria operacional.'
        : 'Check current timestamp and inspect system memory health metrics for operational compliance.',
    },
  ];

  const [goal, setGoal] = useState<string>(PRESETS[0].goal);
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
          tools: BUILTIN_TOOLS,
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
                {isPt ? 'Loop de Raciocínio Delimitado (Plan-Act-Observe-Reflect)' : 'Bounded Agent Reasoning Loop'}
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              {isPt
                ? 'Ciclos iterativos de pensamento, invocação segura de ferramentas com schemas estritos e teto de passos/custos.'
                : 'Iterative Plan-Act-Observe-Reflect cycles using deterministic JSON schemas and hard step caps.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
              {isPt ? 'Teto de Passos: Máx 10' : 'Hard Iteration Cap: Max 10 Steps'}
            </span>
          </div>
        </div>

        {/* Guardrails Pill row */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-2.5">
            <Braces className="w-4 h-4 text-zinc-600 shrink-0" />
            <div>
              <span className="font-bold text-zinc-900 block">
                {isPt ? 'Schema Estruturado' : 'Structured Schema'}
              </span>
              <span className="text-zinc-500 text-[11px]">
                {isPt ? 'Força JSON AgentDecision' : 'Enforces AgentDecision JSON'}
              </span>
            </div>
          </div>
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-2.5">
            <RotateCcw className="w-4 h-4 text-zinc-600 shrink-0" />
            <div>
              <span className="font-bold text-zinc-900 block">
                {isPt ? 'Detector de Repetição' : 'Loop Breaker'}
              </span>
              <span className="text-zinc-500 text-[11px]">
                {isPt ? 'Pára repetições de ferramentas' : 'Halts repetitive tool calls'}
              </span>
            </div>
          </div>
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-zinc-600 shrink-0" />
            <div>
              <span className="font-bold text-zinc-900 block">
                {isPt ? 'Autonomia Delimitada' : 'Bounded Autonomy'}
              </span>
              <span className="text-zinc-500 text-[11px]">
                {isPt ? 'Teto de passos e custo' : 'Ceiling on steps & budget'}
              </span>
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
              {isPt ? 'Configuração da Tarefa' : 'Task Configuration'}
            </h3>

            {/* Presets */}
            <div className="mb-3">
              <span className="text-[11px] font-semibold text-zinc-500 block mb-1.5">
                {isPt ? 'Cenários Rápidos:' : 'Quick Scenarios:'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setGoal(p.goal)}
                    className="text-[11px] px-2 py-1 rounded border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-zinc-700 transition-colors cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 block mb-1">
                {isPt ? 'Objetivo do Agente' : 'Agent Goal'}
              </label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-800 font-sans"
                placeholder={isPt ? 'Descreva o objetivo a ser resolvido pelo agente...' : 'Describe the task for the reasoning loop...'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                  {isPt ? 'Limite de Passos' : 'Max Steps Ceiling'}
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
                  {isPt ? 'Teto de Orçamento (USD)' : 'Cost Ceiling (USD)'}
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

            {/* Active Registered Tools List */}
            <div className="mb-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-amber-500" />
                  {isPt ? 'Ferramentas Conectadas (5)' : 'Live Registered Tools (5)'}
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                  {isPt ? 'Tempo Real' : 'Active'}
                </span>
              </div>
              <div className="space-y-1">
                {BUILTIN_TOOLS.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-[11px] font-mono text-zinc-600">
                    <span className="font-semibold text-zinc-800">• {t.name}</span>
                    <span className="text-[10px] text-zinc-500 truncate max-w-[170px]">{t.description}</span>
                  </div>
                ))}
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
                  <span>{isPt ? 'Executando Ciclos de Raciocínio...' : 'Executing Reasoning Loop...'}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                  <span>{isPt ? 'Iniciar Raciocínio Delimitado' : 'Start Bounded Reasoning'}</span>
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
                  {isPt ? 'Passos de Execução & Telemetria' : 'Execution Steps & Telemetry'}
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
                  <span>{isPt ? 'Erro na Execução do Raciocínio' : 'Reasoning Execution Error'}</span>
                </div>
                <p className="font-mono text-[11px]">{error}</p>
                <p className="text-[11px] text-red-600 mt-2">
                  {isPt
                    ? 'Dica: Mude para o provedor "DARIUS Local Mock Provider" para testar offline com resposta simulada.'
                    : 'Switch to "DARIUS Local Mock Provider" to verify the reasoning loop logic offline.'}
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
                      {isPt ? 'Status:' : 'Status:'} {result.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono">
                    {isPt ? 'Passos:' : 'Steps:'} {result.steps.length} / {maxSteps}
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
                          {isPt ? `Passo #${step.stepNumber}` : `Step #${step.stepNumber}`}
                        </span>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 font-mono font-medium">
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
                        <span className="text-zinc-500 text-[11px] block font-medium">
                          {isPt ? 'Pensamento / Racional:' : 'Thought:'}
                        </span>
                        <p className="text-zinc-800 text-[11px] italic">"{step.decision.thought}"</p>
                      </div>

                      {step.decision.toolCall && (
                        <div className="p-2.5 bg-white rounded-md border border-zinc-200 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-700 flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              {isPt ? 'Invocando Ferramenta:' : 'Invoking Tool:'} {step.decision.toolCall.toolName}
                            </span>
                          </div>
                          <pre className="font-mono text-[10px] text-zinc-600 mt-1 bg-zinc-50 p-1.5 rounded border border-zinc-100 overflow-x-auto">
                            {JSON.stringify(step.decision.toolCall.parameters, null, 2)}
                          </pre>
                        </div>
                      )}

                      {step.toolResult !== undefined && (
                        <div className="p-2.5 bg-emerald-50/70 rounded-md border border-emerald-200 text-[11px]">
                          <span className="font-bold text-emerald-800 block mb-1">
                            {isPt ? 'Resultado da Observação (Executado):' : 'Observation Result:'}
                          </span>
                          <pre className="font-mono text-[10px] text-zinc-800 bg-white/80 p-2 rounded border border-emerald-100 overflow-x-auto">
                            {JSON.stringify(step.toolResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Final Synthesized Output */}
                {result.finalOutput && (
                  <div className="p-4 bg-zinc-900 text-zinc-100 rounded-lg text-xs space-y-1.5 border border-zinc-800">
                    <span className="font-bold text-amber-400 text-[11px] uppercase tracking-wider block flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {isPt ? 'Solução / Resposta Final Sintetizada:' : 'Final Output:'}
                    </span>
                    <p className="leading-relaxed whitespace-pre-wrap">{result.finalOutput}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                <Zap className="w-8 h-8 text-zinc-300 mb-2" />
                <p className="text-xs">
                  {isPt ? 'Nenhuma execução ativa no momento.' : 'No active reasoning execution.'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {isPt
                    ? 'Selecione um cenário ou digite um objetivo e clique em "Iniciar Raciocínio Delimitado".'
                    : 'Configure a goal and click "Start Bounded Reasoning" to watch the agent think and act.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
