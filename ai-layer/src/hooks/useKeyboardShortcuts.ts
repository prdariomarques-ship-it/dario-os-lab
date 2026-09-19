/**
 * Global Keyboard Shortcut Hook
 * Handles Alt + Number key navigation across main tabs
 */

import { useEffect } from 'react';

export interface TabDefinition {
  id: string;
  label?: string;
  defaultLabel?: string;
  labelKey?: string;
}

interface UseKeyboardShortcutsOptions {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onShortcutTriggered?: (tab: TabDefinition, keyNumber: number) => void;
  enabled?: boolean;
}

export function useTabKeyboardShortcuts({
  tabs,
  activeTab,
  onTabChange,
  onShortcutTriggered,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Alt modifier without Ctrl or Meta (Command/Windows)
      if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      // Check for Digit1-Digit9 or Numpad1-Numpad9 or key '1'-'9'
      let num: number | null = null;

      if (event.key >= '1' && event.key <= '9') {
        num = parseInt(event.key, 10);
      } else if (event.code && event.code.startsWith('Digit')) {
        const digit = event.code.replace('Digit', '');
        const parsed = parseInt(digit, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 9) {
          num = parsed;
        }
      } else if (event.code && event.code.startsWith('Numpad')) {
        const numpad = event.code.replace('Numpad', '');
        const parsed = parseInt(numpad, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 9) {
          num = parsed;
        }
      }

      if (num !== null) {
        const tabIndex = num - 1;
        if (tabIndex >= 0 && tabIndex < tabs.length) {
          event.preventDefault();
          const targetTab = tabs[tabIndex];
          if (targetTab && targetTab.id !== activeTab) {
            onTabChange(targetTab.id);
            if (onShortcutTriggered) {
              onShortcutTriggered(targetTab, num);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tabs, activeTab, onTabChange, onShortcutTriggered, enabled]);
}
