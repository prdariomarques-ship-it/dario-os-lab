import { Tool } from "../../../tools/types.js";
import { TelemetryEmitter } from "../../../observability/types.js";
import { FinanceToolSpec, auditedFinanceTool } from "../policies.js";
import {
  MarketDataProvider,
  EconomicDataProvider,
  MockMarketDataProvider,
  MockEconomicDataProvider,
} from "./providers.js";
import { calculatePortfolioMetrics, computeRiskMetrics } from "./calculator.js";
import { runScenarios, DEFAULT_SCENARIOS } from "./simulation.js";
import { FinancePortfolio } from "../types.js";

/**
 * DARIUS Finance — tools wired into the EXISTING Tool Engine.
 *
 * Every tool declares: name, description, schema, permission, risk, timeout,
 * audit flag and validation — as required by the finance product spec.
 * Phase 1 policy: all tools READ + LOW/MEDIUM (see policies.ts).
 */

export const FINANCE_TOOLS = {
  marketData: "finance_market_data",
  economicData: "finance_economic_data",
  portfolioData: "finance_portfolio_data",
  calculator: "finance_calculator",
  simulator: "finance_scenario_simulator",
} as const;

export interface FinanceToolBundle {
  tools: Tool[];
  marketProvider: MarketDataProvider;
  economicProvider: EconomicDataProvider;
}

export function createFinanceTools(options?: {
  marketProvider?: MarketDataProvider;
  economicProvider?: EconomicDataProvider;
  telemetry?: TelemetryEmitter;
  defaultTimeoutMs?: number;
}): FinanceToolBundle {
  const marketProvider = options?.marketProvider ?? new MockMarketDataProvider();
  const economicProvider = options?.economicProvider ?? new MockEconomicDataProvider();
  const timeout = options?.defaultTimeoutMs ?? 5000;
  const telemetry = options?.telemetry;

  const specs: FinanceToolSpec[] = [
    {
      name: FINANCE_TOOLS.marketData,
      description:
        "Recupera cotações para símbolos declarados. Fase 1: provider MOCK determinístico rotulado como demonstração.",
      risk: "LOW",
      permission: "READ",
      timeoutMs: timeout,
      audit: true,
      schema: {
        type: "object",
        required: ["symbols"],
        properties: { symbols: { type: "array", items: { type: "string" } } },
      },
      validate: (params) =>
        Array.isArray((params as { symbols?: unknown }).symbols) &&
        (params as { symbols: unknown[] }).symbols.length > 0,
      execute: async (params) => {
        const symbols = (params as { symbols: string[] }).symbols;
        return { quotes: await marketProvider.getQuotes(symbols), isMock: !marketProvider.isLive };
      },
    },
    {
      name: FINANCE_TOOLS.economicData,
      description:
        "Recupera indicadores macroeconômicos (juros, inflação, câmbio). Fase 1: provider MOCK rotulado.",
      risk: "LOW",
      permission: "READ",
      timeoutMs: timeout,
      audit: true,
      schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } } },
      execute: async (params) => {
        const ids = (params as { ids?: string[] }).ids;
        return { indicators: await economicProvider.getIndicators(ids), isMock: !economicProvider.isLive };
      },
    },
    {
      name: FINANCE_TOOLS.portfolioData,
      description:
        "Carrega a carteira declarada pelo usuário (entrada local; nada é inferido ou buscado externamente).",
      risk: "LOW",
      permission: "READ",
      timeoutMs: timeout,
      audit: true,
      schema: {
        type: "object",
        required: ["portfolio"],
        properties: { portfolio: { type: "object" } },
      },
      validate: (params) => {
        const p = (params as { portfolio?: FinancePortfolio }).portfolio;
        return !!p && Array.isArray(p.holdings);
      },
      execute: async (params) => {
        const portfolio = (params as { portfolio: FinancePortfolio }).portfolio;
        return { portfolio };
      },
    },
    {
      name: FINANCE_TOOLS.calculator,
      description:
        "Calcula métricas determinísticas da carteira: pesos, HHI de concentração, alocação por classe, volatilidade e VaR aproximado.",
      risk: "LOW",
      permission: "READ",
      timeoutMs: timeout,
      audit: true,
      schema: {
        type: "object",
        required: ["portfolio"],
        properties: {
          portfolio: { type: "object" },
          withRisk: { type: "boolean" },
          historyDays: { type: "number" },
        },
      },
      validate: (params) => {
        const p = (params as { portfolio?: FinancePortfolio }).portfolio;
        return !!p && Array.isArray(p.holdings);
      },
      execute: async (params) => {
        const { portfolio, withRisk, historyDays } = params as {
          portfolio: FinancePortfolio; withRisk?: boolean; historyDays?: number;
        };
        const symbols = portfolio.holdings.map(h => h.symbol);
        const quotes = await marketProvider.getQuotes(symbols);
        const metrics = calculatePortfolioMetrics(portfolio, quotes);
        if (!withRisk) return { metrics };

        // Blended deterministic series: value-weighted synthetic history of priced assets.
        const priced = metrics.positions.filter(p => p.priced);
        const days = historyDays ?? 252;
        const seriesById = new Map<string, number[]>();
        for (const pos of priced) {
          seriesById.set(pos.symbol, await marketProvider.getSyntheticPriceHistory(pos.symbol, days));
        }
        const blended: number[] = [];
        const totalWeight = priced.reduce((a, p) => a + p.weight, 0);
        for (let d = 0; d < days; d++) {
          let v = 0;
          for (const pos of priced) {
            v += (pos.weight / (totalWeight || 1)) * (seriesById.get(pos.symbol) as number[])[d];
          }
          blended.push(v);
        }
        return { metrics, risk: computeRiskMetrics(metrics, blended) };
      },
    },
    {
      name: FINANCE_TOOLS.simulator,
      description:
        "Aplica cenários determinísticos de estresse (bear market, choque de juros, cripto, câmbio) sobre a carteira precificada.",
      risk: "MEDIUM",
      permission: "READ",
      timeoutMs: timeout,
      audit: true,
      schema: {
        type: "object",
        required: ["portfolio"],
        properties: { portfolio: { type: "object" }, scenarioIds: { type: "array", items: { type: "string" } } },
      },
      validate: (params) => {
        const p = (params as { portfolio?: FinancePortfolio }).portfolio;
        return !!p && Array.isArray(p.holdings);
      },
      execute: async (params) => {
        const { portfolio, scenarioIds } = params as { portfolio: FinancePortfolio; scenarioIds?: string[] };
        const symbols = portfolio.holdings.map(h => h.symbol);
        const quotes = await marketProvider.getQuotes(symbols);
        const metrics = calculatePortfolioMetrics(portfolio, quotes);
        const chosen = scenarioIds
          ? DEFAULT_SCENARIOS.filter(s => scenarioIds.includes(s.id))
          : DEFAULT_SCENARIOS;
        return { scenarios: runScenarios(chosen, metrics) };
      },
    },
  ];

  return {
    tools: specs.map(spec => auditedFinanceTool(spec, telemetry)),
    marketProvider,
    economicProvider,
  };
}
