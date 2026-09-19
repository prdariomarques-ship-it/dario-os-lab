/**
 * Header Component for DARIUS OSS AI Layer Console
 */

import React from 'react';
import { Brain, Cpu, Download, ShieldCheck, Terminal, Zap, Database, ShieldAlert, Globe } from 'lucide-react';
import { useLanguage, Language } from '../context/LanguageContext.tsx';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeProvider: string;
  setActiveProvider: (p: string) => void;
  hasGeminiKey: boolean;
  onOpenExport: () => void;
}

export interface NavTabItem {
  id: string;
  labelKey: string;
  defaultLabel: string;
  shortcut: number;
}

export const NAVIGATION_TABS: NavTabItem[] = [
  { id: 'overview', labelKey: 'nav.architecture', defaultLabel: 'Architecture', shortcut: 1 },
  { id: 'models', labelKey: 'nav.models', defaultLabel: 'Model Abstraction', shortcut: 2 },
  { id: 'context', labelKey: 'nav.context', defaultLabel: 'Context Engine', shortcut: 3 },
  { id: 'memory', labelKey: 'nav.memory', defaultLabel: 'Memory Subsystem', shortcut: 4 },
  { id: 'reasoning', labelKey: 'nav.reasoning', defaultLabel: 'Reasoning Loop', shortcut: 5 },
  { id: 'routing', labelKey: 'nav.routing', defaultLabel: 'Model Router', shortcut: 6 },
  { id: 'guardrails', labelKey: 'nav.guardrails', defaultLabel: 'Safety & Guardrails', shortcut: 7 },
  { id: 'eval', labelKey: 'nav.eval', defaultLabel: 'Evaluation & Benchmarks', shortcut: 8 },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeProvider,
  setActiveProvider,
  hasGeminiKey,
  onOpenExport,
}) => {
  const { language, setLanguage, t } = useLanguage();

  const tabIcons: Record<string, React.ElementType> = {
    overview: Brain,
    models: Cpu,
    context: Terminal,
    memory: Database,
    reasoning: Zap,
    routing: Brain,
    guardrails: ShieldAlert,
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
                {t('header.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Language Switcher */}
            <div className="flex items-center rounded-md border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLanguage('pt')}
                className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                  language === 'pt' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="Mudar idioma para Português"
              >
                🇧🇷 PT
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                  language === 'en' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="Switch language to English"
              >
                🇺🇸 EN
              </button>
            </div>

            <div className="flex items-center gap-2 bg-zinc-100 px-2.5 py-1 rounded-md text-xs border border-zinc-200">
              <span className="text-zinc-500 font-medium">{t('header.provider')}</span>
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
              <span className="font-medium">{t('header.runtime_ready')}</span>
            </div>

            <button
              onClick={onOpenExport}
              title={t('header.download_zip')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 transition-colors font-medium shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('header.download_zip')}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 sm:space-x-3 overflow-x-auto py-2 scrollbar-none" aria-label="Main Navigation">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            {NAVIGATION_TABS.map((tab) => {
              const Icon = tabIcons[tab.id] || Brain;
              const isActive = activeTab === tab.id;
              const tabLabel = t(tab.labelKey) || tab.defaultLabel;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  title={`Switch to ${tabLabel} (Alt+${tab.shortcut})`}
                  aria-keyshortcuts={`Alt+${tab.shortcut}`}
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
                  <span>{tabLabel}</span>
                  <kbd
                    className={`hidden sm:inline-block text-[10px] font-mono font-normal px-1 py-0.5 rounded transition-opacity ${
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
          </div>

          {/* Prominent Download Button inside nav */}
          <div className="ml-auto pl-4 flex items-center">
            <button
              id="header-nav-download-zip"
              onClick={onOpenExport}
              title="Baixar arquivo ZIP completo do projeto para o GitHub"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md bg-amber-400 hover:bg-amber-300 text-zinc-950 border border-amber-500 shadow-sm transition-all whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4 text-zinc-950" />
              <span>Baixar ZIP do Projeto</span>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
};
