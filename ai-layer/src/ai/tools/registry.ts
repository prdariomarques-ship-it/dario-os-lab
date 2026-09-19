/**
 * DARIUS OSS - Tool Execution Registry
 * Real tool executors for agent reasoning loops: safe calculations, time, text analysis, docs, and system diagnostics.
 */

import { ToolDefinition } from '../types.ts';

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'calculator',
    description: 'Performs safe mathematical and percentage calculations (e.g. 15000 * 0.15, (22500 - 15000) / 15000 * 100)',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The math expression to evaluate (supports +, -, *, /, %, ^, parentheses)',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'datetime',
    description: 'Retrieves the current date, time, timezone, and Unix timestamp',
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: 'Format type: "iso", "human", "utc", or "timestamp"',
        },
      },
    },
  },
  {
    name: 'knowledge_search',
    description: 'Searches technical runbooks, architecture docs, and incident response knowledge base',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords or search topic (e.g. "payment 500 error", "database pool timeout", "latency mitigation")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'text_analyzer',
    description: 'Analyzes text for word count, character count, estimated tokens, and reading duration',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text snippet to analyze',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'system_metrics',
    description: 'Inspects runtime container health, memory usage, heap, Node version, and platform status',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Scope of metrics: "all", "memory", "uptime"',
        },
      },
    },
  },
];

// Technical Knowledge Base Documents
const KNOWLEDGE_DOCS = [
  {
    id: 'kb-pay-500',
    title: 'Payment Checkout 500 Anomaly Runbook',
    tags: ['payment', 'checkout', '500', 'usd', 'gateway', 'currency'],
    snippet: 'When payment checkout throws HTTP 500 on USD transactions, verify ISO currency code conversion matrix in payment-gateway-service v2.1. Recent schema migration requires strict lowercase "usd" vs "USD" handling or defaults to unhandled rejection.',
  },
  {
    id: 'kb-db-pool',
    title: 'Database Connection Pool Exhaustion Guidelines',
    tags: ['database', 'pool', 'timeout', 'latency', 'postgres'],
    snippet: 'Payment DB connection pool limit is capped at 20. If p99 latency exceeds 5000ms, examine unclosed transaction handles in /api/v1/checkout or enable read-replica routing for idempotency checks.',
  },
  {
    id: 'kb-proxy-timeout',
    title: 'Reverse Proxy Ingress Timeout Configuration',
    tags: ['proxy', 'nginx', 'timeout', 'gateway', 'ingress'],
    snippet: 'Ingress reverse proxy has an upstream keepalive timeout of 5000ms. If microservice replies in 5001ms+, nginx immediately terminates with 504 Gateway Timeout.',
  },
  {
    id: 'kb-roi-cloud',
    title: 'Cloud Migration ROI Calculation Template',
    tags: ['roi', 'cloud', 'cost', 'savings', 'migration', 'budget'],
    snippet: 'ROI (%) = ((Total Annual Savings - Total Migration Cost) / Total Migration Cost) * 100. Payback period in months = (Total Migration Cost / Monthly Net Savings).',
  },
];

/**
 * Safe Mathematical Expression Evaluator
 */
function safeEvalMath(expression: string): { result: number; expression: string } {
  // Strip out any unsafe characters - only allow digits, operators, parens, decimal points, spaces
  const cleanExpr = expression.replace(/[^0-9+\-*/().^% eE]/g, '').trim();
  if (!cleanExpr) {
    throw new Error('Invalid or empty mathematical expression');
  }

  // Handle caret power ^
  const normalized = cleanExpr.replace(/\^/g, '**');

  // Strict function constructor evaluation with no global access
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(`"use strict"; return (${normalized});`);
    const val = fn();
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      throw new Error(`Calculation did not yield a valid finite number: ${val}`);
    }
    return {
      result: Math.round(val * 10000) / 10000,
      expression: cleanExpr,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Mathematical evaluation failed: ${msg}`);
  }
}

/**
 * Central Tool Execution Function
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'calculator': {
      const expr = String(args.expression || args.query || args.calc || '');
      try {
        const mathRes = safeEvalMath(expr);
        return {
          status: 'success',
          tool: 'calculator',
          input: expr,
          result: mathRes.result,
          formatted: `${mathRes.expression} = ${mathRes.result}`,
        };
      } catch (err: unknown) {
        return {
          status: 'error',
          tool: 'calculator',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case 'datetime': {
      const now = new Date();
      const format = String(args.format || 'human').toLowerCase();
      return {
        status: 'success',
        tool: 'datetime',
        iso: now.toISOString(),
        utc: now.toUTCString(),
        local: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        timestamp: now.getTime(),
        requestedFormat: format,
      };
    }

    case 'knowledge_search': {
      const query = String(args.query || '').toLowerCase();
      const words = query.split(/\s+/).filter(Boolean);

      const matches = KNOWLEDGE_DOCS.map((doc) => {
        let score = 0;
        for (const w of words) {
          if (doc.title.toLowerCase().includes(w)) score += 3;
          if (doc.snippet.toLowerCase().includes(w)) score += 2;
          if (doc.tags.some((t) => t.includes(w))) score += 2;
        }
        return { doc, score };
      })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => ({
          id: item.doc.id,
          title: item.doc.title,
          snippet: item.doc.snippet,
          relevance: Math.min(1, item.score / 5),
        }));

      return {
        status: 'success',
        tool: 'knowledge_search',
        query,
        foundCount: matches.length,
        results: matches.length > 0 ? matches : [
          {
            id: 'kb-fallback',
            title: 'General Diagnostic Knowledge',
            snippet: `No direct runbook match for "${query}". Recommended operational step: inspect telemetry tracing and audit system logs.`,
            relevance: 0.3,
          },
        ],
      };
    }

    case 'text_analyzer': {
      const text = String(args.text || '');
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const characters = text.length;
      const estimatedTokens = Math.ceil(characters / 3.8);
      const readingTimeSeconds = Math.max(1, Math.round((words / 200) * 60));

      return {
        status: 'success',
        tool: 'text_analyzer',
        metrics: {
          words,
          characters,
          estimatedTokens,
          readingTimeSeconds,
          isConcise: words < 100,
        },
      };
    }

    case 'system_metrics': {
      const mem = process.memoryUsage();
      const uptimeSec = Math.floor(process.uptime());
      return {
        status: 'success',
        tool: 'system_metrics',
        environment: 'Node.js Container Runtime',
        nodeVersion: process.version,
        uptimeSeconds: uptimeSec,
        uptimeFormatted: `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`,
        memoryMb: {
          rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        },
        activeProviders: ['Gemini 3.8 Flash', 'Gemini 3.1 Pro', 'DARIUS Mock Provider'],
      };
    }

    default: {
      return {
        status: 'executed',
        tool: toolName,
        args,
        simulatedOutcome: `Executed ${toolName} with parameters ${JSON.stringify(args)}`,
      };
    }
  }
}
