/**
 * DARIUS OSS - Global Bilingual Context (Português / English)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'pt' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const DICTIONARY: Record<string, Record<Language, string>> = {
  // Navigation tabs
  'nav.architecture': { pt: 'Arquitetura', en: 'Architecture' },
  'nav.models': { pt: 'Abstração de Modelos', en: 'Model Abstraction' },
  'nav.context': { pt: 'Engenharia de Contexto', en: 'Context Engine' },
  'nav.reasoning': { pt: 'Loop de Raciocínio', en: 'Reasoning Loop' },
  'nav.memory': { pt: 'Subsistema de Memória', en: 'Memory Subsystem' },
  'nav.routing': { pt: 'Roteador de Modelos', en: 'Model Router' },
  'nav.guardrails': { pt: 'Escudo & Guardrails', en: 'Safety & Guardrails' },
  'nav.eval': { pt: 'Avaliação & Benchmark', en: 'Evaluation & Benchmarks' },

  // Header
  'header.subtitle': {
    pt: 'Subsistemas: Abstração • Raciocínio • Contexto • Memória • Roteamento • Guardrails',
    en: 'Subsystems: Model Abstraction • Reasoning • Context • Memory • Routing • Guardrails',
  },
  'header.provider': { pt: 'Provedor:', en: 'Provider:' },
  'header.runtime_ready': { pt: 'Ambiente Pronto', en: 'Runtime Ready' },
  'header.download_zip': { pt: 'Baixar ZIP', en: 'Download ZIP' },
  'header.sync_github': { pt: 'Enviar para GitHub', en: 'Push to GitHub' },

  // Architecture view
  'arch.title': { pt: 'Arquitetura do DARIUS OS', en: 'DARIUS OS Architecture' },
  'arch.desc': {
    pt: 'Visão geral do sistema operacional autônomo com camadas estritas de abstração, raciocínio delimitado e segurança.',
    en: 'System overview of the autonomous AI operating system with strict abstraction layers, bounded reasoning, and safety.',
  },

  // Reasoning View
  'reasoning.title': { pt: 'Loop de Raciocínio Delimitado', en: 'Bounded Reasoning Loop' },
  'reasoning.run_btn': { pt: 'Executar Raciocínio', en: 'Execute Reasoning' },
  'reasoning.running': { pt: 'Executando Tarefa...', en: 'Executing Task...' },
  'reasoning.steps': { pt: 'Limite de Passos:', en: 'Max Steps:' },
  'reasoning.budget': { pt: 'Teto de Orçamento (USD):', en: 'Budget Cap (USD):' },
  'reasoning.tools_registered': { pt: 'Ferramentas Conectadas (Tempo Real)', en: 'Live Registered Tools' },
  'reasoning.final_answer': { pt: 'Resposta / Solução Final', en: 'Final Formulation / Solution' },

  // Guardrails
  'guardrails.title': { pt: 'Escudo de Segurança & Guardrails', en: 'Safety & Guardrails Shield' },
  'guardrails.desc': {
    pt: 'Detecção de Injeção de Prompt (Jailbreak), Mascaramento de Dados Sensíveis (CPF, Tokens, Cartões) e Verificação de Alucinação.',
    en: 'Prompt Injection / Jailbreak detection, PII Redaction (CPF, Tokens, Credit Cards), and Grounding Verification.',
  },

  // Footer
  'footer.compliance': {
    pt: 'Compatível com autonomia delimitada, zero exposição de credenciais e runtime independente de provedor.',
    en: 'Compliant with bounded autonomy, zero client credential exposure, and provider-agnostic core runtime.',
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'pt',
  setLanguage: () => {},
  t: (key: string) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to Portuguese since user communicates in Portuguese, but persist in localStorage
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('darius_lang');
    return (saved === 'en' || saved === 'pt') ? saved : 'pt';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('darius_lang', lang);
  };

  const t = (key: string): string => {
    if (DICTIONARY[key]) {
      return DICTIONARY[key][language] || DICTIONARY[key]['pt'] || key;
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
