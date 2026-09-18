/**
 * Header Component for DARIUS OSS AI Layer Console
 */

import React from 'react';
import { Brain, Cpu, Download, ShieldCheck, Terminal, Zap } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeProvider: string;
  setActiveProvider: (p: string) => void;
  hasGeminiKey: boolean;
}

export interface NavTabItem {
  id: string;
  label: string;
  shortcut: number;
}

export const NAVIGATION_TABS: NavTabItem[] = [
  { id: 'overview', label: 'Architecture', shortcut: 1 },
  { id: 'models', label: 'Model Abstraction', shortcut: 2 },
  { id: 'context', label: 'Context Engine', shortcut: 3 },
  { id: 'reasoning', label: 'Reasoning Loop', shortcut: 4 },
  { id: 'routing', label: 'Model Router', shortcut: 5 },
  { id: 'eval', label: 'Evaluation & Benchmarks', shortcut: 6 },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeProvider,
  setActiveProvider,
  hasGeminiKey,
}) => {
  const tabIcons: Record<string, React.ElementType> = {
    overview: Brain,
    models: Cpu,
    context: Terminal,
    reasoning: Zap,
    routing: Brain,
    eval: ShieldCheck,
  };

  return (
    <header className="border-b border-zinc-200 bg-white/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-zinc-900 flex items-center justify-center text-white shadow-sm">
              <Brain className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-900 tracking-tight text-base">DARIUS OSS</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                  AI & Reasoning Layer
                </span>
              </div>
              <p className="text-xs text-zinc-500 hidden sm:block">
                Subsystems: Model Abstraction • Reasoning • Context • Routing • Evaluation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-100 px-2.5 py-1 rounded-md text-xs border border-zinc-200">
              <span className="text-zinc-500 font-medium">Provider:</span>
              <select
                value={activeProvider}
                onChange={(e) => setActiveProvider(e.target.value)}
                className="bg-transparent font-medium text-zinc-900 focus:outline-none cursor-pointer"
              >
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (Server)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                <option value="darius-mock-v1">DARIUS Local Mock Provider</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-medium">Runtime Ready</span>
            </div>

            <a
              href="/api/download-zip"
              download="darius-os-lab.zip"
              title="Download Complete Project ZIP"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 transition-colors font-medium shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Baixar ZIP</span>
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2 scrollbar-none" aria-label="Main Navigation">
          {NAVIGATION_TABS.map((tab) => {
            const Icon = tabIcons[tab.id] || Brain;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                title={`Switch to ${tab.label} (Alt+${tab.shortcut})`}
                aria-keyshortcuts={`Alt+${tab.shortcut}`}
                className={`group flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
                <kbd
                  className={`hidden sm:inline-block text-[10px] font-mono font-normal px-1.5 py-0.5 rounded transition-opacity ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                      : 'bg-zinc-200/70 text-zinc-500 border border-zinc-300/80 group-hover:text-zinc-700'
                  }`}
                >
                  Alt+{tab.shortcut}
                </kbd>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
