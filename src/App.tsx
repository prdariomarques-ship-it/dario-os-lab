/**
 * DARIUS OSS - AI & Reasoning Layer Console
 * Main UI Dashboard showcasing Model Abstraction, Context Engineering,
 * Bounded Reasoning Loop, Model Router, and Evaluation Suite.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header, NAVIGATION_TABS } from './components/Header.tsx';
import { ArchitectureView } from './components/ArchitectureView.tsx';
import { ModelPlayground } from './components/ModelPlayground.tsx';
import { ContextInspector } from './components/ContextInspector.tsx';
import { ReasoningView } from './components/ReasoningView.tsx';
import { RouterView } from './components/RouterView.tsx';
import { EvaluationView } from './components/EvaluationView.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { useTabKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { Command } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [activeProvider, setActiveProvider] = useState<string>('gemini-3.8-flash');
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);
  const [shortcutFeedback, setShortcutFeedback] = useState<{ label: string; key: number } | null>(null);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

  const handleShortcutTriggered = useCallback((tab: { id: string; label: string }, keyNum: number) => {
    setShortcutFeedback({ label: tab.label, key: keyNum });
    const timer = setTimeout(() => {
      setShortcutFeedback((current) => (current?.key === keyNum ? null : current));
    }, 1600);
    return () => clearTimeout(timer);
  }, []);

  // Global Keyboard Shortcut Handler: Alt + 1-6 toggles navigation tabs
  useTabKeyboardShortcuts({
    tabs: NAVIGATION_TABS,
    activeTab,
    onTabChange: setActiveTab,
    onShortcutTriggered: handleShortcutTriggered,
  });

  useEffect(() => {
    // Health check on server
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data.hasGeminiKey === false) {
          // If no Gemini key is set, automatically default to mock provider
          setActiveProvider('darius-mock-v1');
          setHasGeminiKey(false);
        }
      })
      .catch((err) => console.log('Server health check error', err));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeProvider={activeProvider}
        setActiveProvider={setActiveProvider}
        hasGeminiKey={hasGeminiKey}
        onOpenExport={() => setIsExportOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {activeTab === 'overview' && <ArchitectureView />}
        {activeTab === 'models' && <ModelPlayground activeProvider={activeProvider} />}
        {activeTab === 'context' && <ContextInspector />}
        {activeTab === 'reasoning' && <ReasoningView activeProvider={activeProvider} />}
        {activeTab === 'routing' && <RouterView />}
        {activeTab === 'eval' && <EvaluationView activeProvider={activeProvider} />}
      </main>

      <footer className="border-t border-zinc-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-800">DARIUS OSS</span>
            <span>•</span>
            <span>AI, Reasoning & Evaluation Layer</span>
          </div>
          <p>
            Compliant with bounded autonomy, zero client credential exposure, and provider-agnostic core runtime.
          </p>
        </div>
      </footer>

      {/* Floating Keyboard Shortcut Feedback Toast */}
      {shortcutFeedback && (
        <div
          id="keyboard-shortcut-toast"
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-zinc-900/95 text-white shadow-lg border border-zinc-800 text-xs font-medium backdrop-blur transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <Command className="w-3.5 h-3.5 text-amber-400" />
          <span>Switched to <strong className="text-white font-semibold">{shortcutFeedback.label}</strong></span>
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 font-mono text-[10px] border border-zinc-700">
            Alt+{shortcutFeedback.key}
          </kbd>
        </div>
      )}
      {/* Export & ZIP Modal */}
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </div>
  );
}
