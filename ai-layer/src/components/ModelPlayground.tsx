/**
 * Model Abstraction Playground
 * Allows direct testing of generate(), stream(), structuredOutput(), and capabilities()
 */

import React, { useState } from 'react';
import {
  Cpu,
  Play,
  Layers,
  Sparkles,
  Zap,
  Code,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertCircle,
  Braces,
} from 'lucide-react';
import { AgentDecisionSchema } from '../ai/reasoning/loop.ts';

interface ModelPlaygroundProps {
  activeProvider: string;
}

export const ModelPlayground: React.FC<ModelPlaygroundProps> = ({ activeProvider }) => {
  const [method, setMethod] = useState<'generate' | 'stream' | 'structuredOutput'>('generate');
  const [prompt, setPrompt] = useState('Analyze the key advantages of provider-agnostic model abstraction in agent runtime systems.');
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState<string>('');
  const [structuredData, setStructuredData] = useState<Record<string, unknown> | null>(null);
  const [metrics, setMetrics] = useState<{
    latencyMs?: number;
    tokens?: number;
    cost?: number;
    finishReason?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);

  const capabilitiesData: Record<string, {
    maxTokens: string;
    outputLimit: string;
    cost: string;
    tier: string;
    features: string[];
  }> = {
    'gemini-3.8-flash': {
      maxTokens: '1,048,576 tokens (1M)',
      outputLimit: '65,536 tokens',
      cost: '$0.00015 / 1k in | $0.0006 / 1k out',
      tier: 'Low Latency (~200ms)',
      features: ['Streaming', 'Structured JSON Schema', 'Function Calling', 'Multimodal', 'Reasoning Capable'],
    },
    'gemini-3.1-pro-preview': {
      maxTokens: '1,048,576 tokens (1M)',
      outputLimit: '65,536 tokens',
      cost: '$0.00125 / 1k in | $0.005 / 1k out',
      tier: 'Medium Latency (Deep STEM/Code)',
      features: ['Advanced Reasoning', 'Streaming', 'Structured Output', 'High-complexity Coding'],
    },
    'gemini-3.1-flash-lite': {
      maxTokens: '1,048,576 tokens (1M)',
      outputLimit: '8,192 tokens',
      cost: '$0.000075 / 1k in | $0.0003 / 1k out',
      tier: 'Ultra-Low Latency (~80ms)',
      features: ['High-throughput', 'Low Cost Classification', 'Streaming'],
    },
    'darius-mock-v1': {
      maxTokens: '32,768 tokens (Offline)',
      outputLimit: '4,096 tokens',
      cost: '$0.00 (Zero Quota / Deterministic)',
      tier: 'Local Instant (~30ms)',
      features: ['Deterministic Test Rules', 'Offline Mock Streaming', 'Zero Cost Benchmarking'],
    },
  };

  const currentCaps = capabilitiesData[activeProvider] || capabilitiesData['darius-mock-v1'];

  const runModelCall = async () => {
    setIsLoading(true);
    setError(null);
    setOutput('');
    setStructuredData(null);
    setMetrics({});

    const startTime = Date.now();

    try {
      if (method === 'generate') {
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: prompt,
            modelId: activeProvider,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Generate request failed');
        }

        setOutput(data.text);
        setMetrics({
          latencyMs: data.latencyMs || Date.now() - startTime,
          tokens: data.usage?.totalTokens || 0,
          cost: data.usage?.estimatedCostUsd || 0,
          finishReason: data.finishReason || 'STOP',
        });
      } else if (method === 'structuredOutput') {
        const res = await fetch('/api/ai/structured', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: prompt,
            schema: AgentDecisionSchema,
            modelId: activeProvider,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Structured output request failed');
        }

        setStructuredData(data);
        setOutput(JSON.stringify(data, null, 2));
        setMetrics({
          latencyMs: Date.now() - startTime,
          tokens: Math.ceil((prompt.length + JSON.stringify(data).length) / 4),
          finishReason: 'SCHEMA_VALIDATED',
        });
      } else if (method === 'stream') {
        const res = await fetch('/api/ai/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: prompt,
            modelId: activeProvider,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Stream failed');
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No readable stream available');

        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value);
          const lines = textChunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.delta) {
                  accumulated += parsed.delta;
                  setOutput(accumulated);
                }
              } catch (e) {
                // Ignore chunk parse error
              }
            }
          }
        }

        setMetrics({
          latencyMs: Date.now() - startTime,
          tokens: Math.ceil((prompt.length + accumulated.length) / 4),
          finishReason: 'STREAM_COMPLETE',
        });
      }
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
      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-5 h-5 text-zinc-800" />
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Model Abstraction Interface
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              Contract: <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800 font-mono">generate()</code>, <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800 font-mono">stream()</code>, <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800 font-mono">structuredOutput()</code>, <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800 font-mono">capabilities()</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
              Active: {activeProvider}
            </span>
          </div>
        </div>

        {/* Capabilities Card */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-zinc-50 border border-zinc-200 rounded-lg p-3">
          <div>
            <span className="text-zinc-500 block">Context Window:</span>
            <span className="font-semibold text-zinc-800">{currentCaps.maxTokens}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Max Output:</span>
            <span className="font-semibold text-zinc-800">{currentCaps.outputLimit}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Pricing Tier:</span>
            <span className="font-semibold text-zinc-800">{currentCaps.cost}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Latency Tier:</span>
            <span className="font-semibold text-zinc-800">{currentCaps.tier}</span>
          </div>
        </div>
      </div>

      {/* Playground Input/Output Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Request Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Execution Method
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                id="btn-method-generate"
                onClick={() => setMethod('generate')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                  method === 'generate'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                generate()
              </button>
              <button
                type="button"
                id="btn-method-stream"
                onClick={() => setMethod('stream')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                  method === 'stream'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                stream()
              </button>
              <button
                type="button"
                id="btn-method-structured"
                onClick={() => setMethod('structuredOutput')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                  method === 'structuredOutput'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                structuredOutput()
              </button>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                  Input Prompt
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setPrompt(
                      method === 'structuredOutput'
                        ? 'Formulate next action to check server telemetry status and verify disk space.'
                        : 'Explain how context engineering prevents prompt degradation in LLM agents.'
                    )
                  }
                  className="text-[11px] text-amber-700 hover:underline"
                >
                  Load sample
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="w-full text-xs font-mono p-3 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-800"
                placeholder="Enter input prompt..."
              />
            </div>

            {method === 'structuredOutput' && (
              <div className="mb-4 p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <Braces className="w-4 h-4 text-amber-700" />
                  <span>Schema: AgentDecision</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Enforces deterministic schema with fields: <code className="font-mono">thought</code>, <code className="font-mono">stateAssessment</code>, <code className="font-mono">nextAction</code>, <code className="font-mono">confidence</code>.
                </p>
              </div>
            )}

            <button
              type="button"
              id="btn-run-model-call"
              onClick={runModelCall}
              disabled={isLoading || !prompt.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-zinc-900 text-white font-medium text-xs hover:bg-zinc-800 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Executing Model Call...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute {method}()</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right column: Response & Telemetry */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col h-full min-h-[380px]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-3">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-zinc-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Model Output Console
                </span>
              </div>

              {metrics.latencyMs !== undefined && (
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    {metrics.latencyMs}ms
                  </span>
                  {metrics.tokens !== undefined && (
                    <span className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      ~{metrics.tokens} tokens
                    </span>
                  )}
                  {metrics.cost !== undefined && metrics.cost > 0 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      ${metrics.cost.toFixed(6)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span>Provider Call Failed</span>
                </div>
                <p className="font-mono text-[11px] break-all">{error}</p>
                <p className="text-[11px] text-red-600 mt-2">
                  Tip: If using Gemini with exhausted external quota, switch to <strong>DARIUS Local Mock Provider</strong> above to verify logic without API limits.
                </p>
              </div>
            ) : output ? (
              <div className="flex-1 flex flex-col">
                {structuredData ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-800 mb-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Deterministic Structured Output Validated</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                        <div>
                          <span className="text-zinc-500">Action:</span>{' '}
                          <span className="font-semibold text-zinc-900 font-mono">
                            {String(structuredData.nextAction || '')}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Confidence:</span>{' '}
                          <span className="font-semibold text-zinc-900 font-mono">
                            {String(structuredData.confidence || '')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <pre className="p-3 bg-zinc-900 text-zinc-100 rounded-lg text-xs font-mono overflow-auto max-h-80 scrollbar-none">
                      {JSON.stringify(structuredData, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="flex-1 p-4 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-sans leading-relaxed text-zinc-800 overflow-auto whitespace-pre-wrap">
                    {output}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                <Code className="w-8 h-8 text-zinc-300 mb-2" />
                <p className="text-xs">No output generated yet.</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Select a method and click "Execute" to run the model through the abstraction layer.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
