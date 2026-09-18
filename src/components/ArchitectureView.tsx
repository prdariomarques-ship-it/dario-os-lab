/**
 * Architecture & Philosophy Overview Component for DARIUS OSS AI Layer
 */

import React from 'react';
import {
  Layers,
  Cpu,
  Zap,
  Route,
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  Sparkles,
  Database,
} from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const pillars = [
    {
      num: '01',
      title: 'Model Abstraction Interface',
      icon: Cpu,
      summary: 'Unified contract decoupled from specific providers.',
      points: [
        'Contract: generate(), stream(), structuredOutput(), capabilities()',
        'Hot-swappable providers: GeminiProvider (@google/genai SDK) & MockProvider',
        'Zero vendor lock-in: Core runtime never imports proprietary provider packages',
      ],
    },
    {
      num: '02',
      title: 'Context Engineering Layer',
      icon: Layers,
      summary: 'Strict multi-tier prompt composition avoiding monolithic blobs.',
      points: [
        '6 isolated layers: System, Task, Memory, Tools, History, Observations',
        'Dynamic token budget allocator with non-destructive tiered trimming',
        'Preserves high-priority instructions while managing context limits',
      ],
    },
    {
      num: '03',
      title: 'Memory Subsystem (Short & Long-Term)',
      icon: Database,
      summary: 'Conversational state management and multi-criteria context retrieval.',
      points: [
        'Short-term sliding window with automated compaction and episodic summaries',
        'Long-term knowledge store indexed by category, importance, and tags',
        'Multi-criteria scoring: TF-IDF lexical overlap, recency decay, and importance weighting',
      ],
    },
    {
      num: '04',
      title: 'Bounded Reasoning Loop',
      icon: Zap,
      summary: 'Deterministic structured decisions with hard step ceilings.',
      points: [
        'Structured Output Schema: AgentDecision JSON with thought & state assessment',
        'Loop-breaker: detects repeated invocations and prevents runaway execution',
        'Hard step limits (max 10 iterations) and strict cost/time limits',
      ],
    },
    {
      num: '05',
      title: 'Dynamic Model Routing',
      icon: Route,
      summary: 'Cost and latency optimization based on task complexity.',
      points: [
        'Complexity heuristics: Simple (Flash Lite) / Standard (Flash) / Complex (Pro)',
        'Multi-criteria scoring: Cost, latency, reasoning capability, token size',
        'Automatic fallback routing if primary provider encounters rate limits',
      ],
    },
    {
      num: '06',
      title: 'Evaluation & Benchmarks',
      icon: ShieldCheck,
      summary: 'Quantitative evaluation across 8 dimensions.',
      points: [
        'Metrics: Task Success, Tool Correctness, Hallucination, Retry, Safety, Latency, Cost, Tokens',
        'Curated benchmark fixtures testing edge cases, tool errors, and prompt injections',
        'Deterministic automated scoring for offline regression prevention',
      ],
    },
  ];

  const boundaries = [
    {
      title: 'Strict Bounded Autonomy',
      desc: 'No unbounded loops. The agent executes within explicit step budgets and cost ceilings.',
      icon: AlertOctagon,
      badge: 'Safety Rule',
    },
    {
      title: 'No Direct Channel Coupling',
      desc: 'No direct Telegram or messaging hooks in the AI layer; all messaging stays in Core Runtime.',
      icon: CheckCircle2,
      badge: 'Separation of Concerns',
    },
    {
      title: 'API Keys Kept Server-Side',
      desc: 'API keys are strictly managed on the server backend; zero credentials exposed to frontend.',
      icon: CheckCircle2,
      badge: 'Security Rule',
    },
    {
      title: 'Mock & Offline Fallbacks',
      desc: 'Full mock provider and evaluation fixtures support offline tests without external quota.',
      icon: Sparkles,
      badge: 'Reliability Rule',
    },
  ];

  return (
    <div className="space-y-8 py-6">
      {/* Hero / Header Card */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Architecture & Intelligence Layer Specification</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
            DARIUS AI, Reasoning & Evaluation Architecture
          </h1>
          <p className="mt-2.5 text-zinc-600 text-sm sm:text-base leading-relaxed">
            Complementing Jules (Core Runtime) and Antigravity (Architecture/Engineering), this layer delivers a provider-agnostic model abstraction, multi-layered context engineering, bounded deterministic reasoning, intelligent model routing, and automated safety evaluation.
          </p>
        </div>

        {/* High-level Data Flow */}
        <div className="mt-8 border-t border-zinc-100 pt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">
            Intelligence Pipeline Dataflow
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="font-bold text-zinc-900 block mb-1">1. User / Task Goal</span>
              <p className="text-zinc-600">Dispatched from Core Runtime into Task Context.</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="font-bold text-zinc-900 block mb-1">2. Context Assembly</span>
              <p className="text-zinc-600">ContextBuilder isolates 6 layers & manages token budget.</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="font-bold text-zinc-900 block mb-1">3. Model Router</span>
              <p className="text-zinc-600">Selects Flash, Flash Lite, Pro, or Mock based on complexity.</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="font-bold text-zinc-900 block mb-1">4. Reasoning Engine</span>
              <p className="text-zinc-600">Bounded step loop enforces AgentDecision schema.</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="font-bold text-zinc-900 block mb-1">5. Evaluation Suite</span>
              <p className="text-zinc-600">Scores task success, safety, and hallucination resistance.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Architectural Pillars Grid */}
      <div>
        <h2 className="text-lg font-bold text-zinc-900 mb-4 tracking-tight">
          The 5 Pillars of DARIUS Intelligence Layer
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.num}
                className="bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-zinc-100 text-zinc-900">
                      <Icon className="w-5 h-5 text-zinc-700" />
                    </div>
                    <span className="text-xs font-mono font-bold text-zinc-400">{pillar.num}</span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 tracking-tight mb-1">
                    {pillar.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mb-4">{pillar.summary}</p>
                  <ul className="space-y-2 text-xs text-zinc-600">
                    {pillar.points.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Constraints & Safety Guarantees */}
      <div className="bg-zinc-900 text-white rounded-xl p-6 sm:p-8">
        <h2 className="text-lg font-bold tracking-tight text-white mb-2">
          Safety Guarantees & Constraints Enforced
        </h2>
        <p className="text-xs text-zinc-400 mb-6 max-w-2xl">
          Designed specifically to honor the rules of DARIUS OSS: zero unconstrained autonomy, safe credentials handling, and decoupled modularity.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {boundaries.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div key={idx} className="bg-zinc-800/80 border border-zinc-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                    {b.badge}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">{b.title}</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
