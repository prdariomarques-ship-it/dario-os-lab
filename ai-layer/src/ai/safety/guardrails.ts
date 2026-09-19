/**
 * DARIUS OSS - Guardrails & Safety Subsystem
 * Enforces strict input validation, prompt injection defense, PII masking, and output grounding verification.
 */

export interface GuardrailIssue {
  type: 'prompt_injection' | 'pii_leak' | 'secret_leak' | 'content_violation' | 'ungrounded_claim';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  matchedPattern?: string;
  recommendation: string;
}

export interface GuardrailInspectionResult {
  isSafe: boolean;
  riskScore: number; // 0 (completely safe) to 100 (extreme danger)
  issues: GuardrailIssue[];
  sanitizedText: string;
  piiRedactedCount: number;
  injectionDetected: boolean;
  evaluationDurationMs: number;
}

// Patterns commonly used in prompt injections, jailbreaks, and delimiter escapes
const INJECTION_PATTERNS: { regex: RegExp; label: string; severity: 'medium' | 'high' | 'critical' }[] = [
  {
    regex: /(?:ignore|disregard|forget|bypass)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|rules|prompts|directives)/i,
    label: 'Instruction Override Attempt',
    severity: 'critical',
  },
  {
    regex: /(?:system\s*override|developer\s*mode|dan\s*mode|unfiltered\s*mode|god\s*mode)/i,
    label: 'Persona / Jailbreak Mode Activation',
    severity: 'critical',
  },
  {
    regex: /<\/?(?:system|instruction|prompt|context|admin)>/i,
    label: 'Fake System Delimiter Tag Injection',
    severity: 'high',
  },
  {
    regex: /(?:reveal|print|show|dump|leak)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|hidden\s+rules|api\s*key)/i,
    label: 'System Prompt / Secret Extraction',
    severity: 'high',
  },
  {
    regex: /(?:act\s+as\s+(?:an?\s+)?unrestricted|simulate\s+unconstrained|jailbreak)/i,
    label: 'Behavioral Boundary Evasion',
    severity: 'high',
  },
];

// Patterns for Sensitive Information (PII & Credentials)
const PII_PATTERNS: { regex: RegExp; label: string; replacement: string; severity: 'high' | 'critical' }[] = [
  {
    // Brazilian CPF: 000.000.000-00 or 11 continuous digits with valid format
    regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b(?=.*(?:cpf|documento|titular))/i,
    label: 'Brazilian CPF (Personal Tax ID)',
    replacement: '[REDACTED_CPF]',
    severity: 'critical',
  },
  {
    // GitHub Tokens (ghp_... or github_pat_...)
    regex: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/,
    label: 'GitHub Personal Access Token',
    replacement: '[REDACTED_GITHUB_TOKEN]',
    severity: 'critical',
  },
  {
    // Generic API Keys (sk-..., AIza...)
    regex: /\b(?:sk-[a-zA-Z0-9]{32,}|AIza[0-9A-Za-z-_]{35})\b/,
    label: 'Cloud / OpenAI / Google API Key',
    replacement: '[REDACTED_API_KEY]',
    severity: 'critical',
  },
  {
    // Credit Card (Visa, Mastercard, Amex, Discover with hyphens or spaces)
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b|\b(?:\d{4}[ -]?){3}\d{4}\b(?=.*(?:card|cartao|cvv|validade))/i,
    label: 'Payment Card Number (PCI-DSS)',
    replacement: '[REDACTED_CREDIT_CARD]',
    severity: 'critical',
  },
  {
    // Email addresses when embedded in untrusted prompt
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b(?=.*(?:senha|password|secret|confidencial))/i,
    label: 'Sensitive Email Credential',
    replacement: '[REDACTED_EMAIL]',
    severity: 'high',
  },
];

export class GuardrailsEngine {
  /**
   * Inspects input text for security risks, prompt injection, and PII leaks.
   */
  public static inspectInput(text: string): GuardrailInspectionResult {
    const startTime = Date.now();
    const issues: GuardrailIssue[] = [];
    let sanitizedText = text;
    let piiCount = 0;
    let injectionFound = false;

    // 1. Check Prompt Injections
    for (const item of INJECTION_PATTERNS) {
      const match = text.match(item.regex);
      if (match) {
        injectionFound = true;
        issues.push({
          type: 'prompt_injection',
          severity: item.severity,
          description: `Detected potential adversarial prompt injection attempt: "${item.label}"`,
          matchedPattern: match[0],
          recommendation: 'Strip instructions attempting to alter core operational guardrails or system prompt.',
        });
      }
    }

    // 2. Check and Redact PII / Secrets
    for (const item of PII_PATTERNS) {
      if (item.regex.test(sanitizedText)) {
        const matches = sanitizedText.match(new RegExp(item.regex, 'g')) || [];
        piiCount += matches.length;
        sanitizedText = sanitizedText.replace(new RegExp(item.regex, 'g'), item.replacement);

        issues.push({
          type: item.label.includes('Token') || item.label.includes('Key') ? 'secret_leak' : 'pii_leak',
          severity: item.severity,
          description: `Detected sensitive data leak: ${item.label} (${matches.length} instance${matches.length > 1 ? 's' : ''})`,
          recommendation: `Data automatically masked with ${item.replacement} before reaching LLM context.`,
        });
      }
    }

    // Calculate Risk Score (0 - 100)
    let score = 0;
    for (const iss of issues) {
      if (iss.severity === 'critical') score += 40;
      else if (iss.severity === 'high') score += 25;
      else if (iss.severity === 'medium') score += 15;
      else score += 5;
    }
    const finalRiskScore = Math.min(100, score);
    const isSafe = finalRiskScore < 40 && !injectionFound;

    return {
      isSafe,
      riskScore: finalRiskScore,
      issues,
      sanitizedText,
      piiRedactedCount: piiCount,
      injectionDetected: injectionFound,
      evaluationDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Grounding Verification: checks whether an answer is grounded in provided reference context.
   */
  public static verifyGrounding(
    answer: string,
    contextChunks: string[]
  ): { groundingScore: number; supportedFacts: string[]; unsupportedClaims: string[] } {
    if (!contextChunks || contextChunks.length === 0 || !answer) {
      return { groundingScore: 50, supportedFacts: [], unsupportedClaims: ['No context provided for verification'] };
    }

    const contextText = contextChunks.join(' ').toLowerCase();
    const answerSentences = answer
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    const supported: string[] = [];
    const unsupported: string[] = [];

    for (const sentence of answerSentences) {
      const words = sentence
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);

      if (words.length === 0) continue;

      const matchedWords = words.filter((w) => contextText.includes(w));
      const overlapRatio = matchedWords.length / words.length;

      if (overlapRatio >= 0.4) {
        supported.push(sentence);
      } else {
        unsupported.push(sentence);
      }
    }

    const total = supported.length + unsupported.length;
    const groundingScore = total > 0 ? Math.round((supported.length / total) * 100) : 100;

    return {
      groundingScore,
      supportedFacts: supported,
      unsupportedClaims: unsupported,
    };
  }
}
