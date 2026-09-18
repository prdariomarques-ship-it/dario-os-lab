/**
 * Automated Evaluation & Benchmarks View
 * Measures Task Success, Tool Correctness, Hallucination, Retry, Latency, Cost, and Safety
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  DollarSign,
  BarChart3,
  Award,
  Flame,
} from 'lucide-react';
import { BenchmarkReport, TestCaseResult } from '../ai/evaluation/types.ts';
import { EVALUATION_FIXTURES } from '../ai/evaluation/fixtures.ts';

interface EvaluationViewProps {
  activeProvider: string;
}

export const EvaluationView: React.FC<EvaluationViewProps> = ({ activeProvider }) => {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runBenchmark = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/evaluation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: activeProvider,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Benchmark run failed');
      }

      setReport(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 py-6">
      {/* Header Banner */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Automated Agent Evaluation Suite
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              Evaluates agent reasoning across 8 dimensions: Task Success, Tool Correctness, Hallucination, Retry, Safety, Latency, Tokens, and Cost.
            </p>
          </div>

          <button
            type="button"
            id="btn-run-benchmark"
            onClick={runBenchmark}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Running Benchmark Suite ({EVALUATION_FIXTURES.length} cases)...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Full Benchmark Suite</span>
              </>
            )}
          </button>
        </div>

        {/* Fixtures summary */}
        <div className="mt-5 border-t border-zinc-100 pt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span className="font-semibold text-zinc-800">5 Curated Scenarios:</span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono">
            EVAL-01: Tool Precision
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono">
            EVAL-02: Hallucination Guard
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono">
            EVAL-03: Safety Containment
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono">
            EVAL-04: Multi-Step Reasoning
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono">
            EVAL-05: Error Recovery
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <span className="font-bold block mb-1">Evaluation Error</span>
          <p className="font-mono text-[11px]">{error}</p>
        </div>
      )}

      {/* Benchmark Results Scorecard */}
      {report && (
        <div className="space-y-6">
          {/* Top Score Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
              <span className="text-zinc-500 text-[11px] block">Overall Score</span>
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                {report.overallScore} / 100
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5 font-medium">
                {report.passedCases} / {report.totalCases} passed
              </span>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
              <span className="text-zinc-500 text-[11px] block">Task Success</span>
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                {report.metricAverages.taskSuccess}%
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5 font-mono">Goal fulfillment</span>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
              <span className="text-zinc-500 text-[11px] block">Tool Correctness</span>
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                {report.metricAverages.toolCorrectness}%
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5 font-mono">Param precision</span>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
              <span className="text-zinc-500 text-[11px] block">Hallucination Guard</span>
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                {report.metricAverages.hallucination}%
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5 font-mono">Zero fabrications</span>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
              <span className="text-zinc-500 text-[11px] block">Safety Containment</span>
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                {report.metricAverages.safety}%
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5 font-mono">Injection refused</span>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
              <span className="text-zinc-500 text-[11px] block">Average Latency</span>
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">
                {report.averageLatencyMs}ms
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5 font-mono">Per scenario</span>
            </div>
          </div>

          {/* Test Case Detail List */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
            <h3 className="text-sm font-bold text-zinc-900 mb-4 tracking-tight">
              Test Case Execution Breakdown
            </h3>

            <div className="space-y-3">
              {report.results.map((res: TestCaseResult) => (
                <div
                  key={res.testId}
                  className="border border-zinc-200 rounded-lg p-4 bg-zinc-50/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {res.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span className="font-bold text-zinc-900 font-mono">{res.testId}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono bg-zinc-200 text-zinc-700">
                        {res.category}
                      </span>
                    </div>

                    <div className="text-zinc-600 text-[11px] space-y-0.5 pl-6">
                      {res.notes.map((note, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-zinc-400" />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-zinc-500 text-[11px] shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                    <div className="text-right">
                      <span className="text-zinc-400 block">Latency</span>
                      <span className="font-mono font-semibold text-zinc-800">
                        {res.metrics.latencyMs}ms
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 block">Tokens</span>
                      <span className="font-mono font-semibold text-zinc-800">
                        {res.metrics.totalTokens}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 block">Steps</span>
                      <span className="font-mono font-semibold text-zinc-800">
                        {res.metrics.stepCount}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 block">Score</span>
                      <span
                        className={`font-mono font-bold text-sm ${
                          res.passed ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {Math.round(
                          (res.scores.taskSuccess +
                            res.scores.toolCorrectness +
                            res.scores.hallucinationScore +
                            res.scores.retryBehaviorScore +
                            res.scores.safetyScore) /
                            5
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Default placeholder if no benchmark run yet */}
      {!report && (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-zinc-400 shadow-xs">
          <BarChart3 className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-zinc-700 mb-1">
            Benchmark Suite Ready
          </h4>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Click "Run Full Benchmark Suite" above to execute all automated test fixtures and measure Task Success, Tool Correctness, Hallucination Resistance, and Safety Containment.
          </p>
        </div>
      )}
    </div>
  );
};
