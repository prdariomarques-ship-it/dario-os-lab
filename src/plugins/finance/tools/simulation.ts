import {
  PortfolioMetrics,
  ScenarioDefinition,
  ScenarioResult,
} from "../types.js";
import { round } from "./calculator.js";

/**
 * DARIUS Finance — deterministic scenario simulator.
 *
 * Applies declared shocks over priced positions. No randomness, no
 * probabilities invented: a scenario says exactly what it assumes.
 */

export const DEFAULT_SCENARIOS: ScenarioDefinition[] = [
  {
    id: "EQUITY_BEAR_30",
    label: "Bear market: -30% em renda variável",
    description: "Pressão generalizada sobre ações, fundos e REITs (choque declarado, não probabilístico).",
    shocks: [{ assetClass: "EQUITY", pctChange: -0.3 }, { assetClass: "REIT", pctChange: -0.3 }],
  },
  {
    id: "CRYPTO_CRASH_50",
    label: "Cripto: -50%",
    description: "Perda severa de valor em criptoativos (evento histórico recorrente, usado como estresse).",
    shocks: [{ assetClass: "CRYPTO", pctChange: -0.5 }],
  },
  {
    id: "RATE_SHOCK_200BPS",
    label: "Choque de juros: +200 bps",
    description: "Impacto aproximado em renda fixa via duration assumida de 4 anos (premissa declarada).",
    shocks: [{ assetClass: "FIXED_INCOME", pctChange: -0.08 }],
  },
  {
    id: "FX_DEVAL_15",
    label: "Desvalorização cambial: -15% (BRL)",
    description: "Estresse de câmbio sobre ativos indexados a moeda estrangeira, quando sinalizado.",
    shocks: [{ assetClass: "CASH", pctChange: -0.05 }],
  },
];

export function applyScenario(
  scenario: ScenarioDefinition,
  metrics: PortfolioMetrics
): ScenarioResult | null {
  if (metrics.pricedValue <= 0) return null;

  let totalImpact = 0;
  const mostAffected: Array<{ symbol: string; impactValue: number }> = [];

  for (const position of metrics.positions) {
    if (!position.priced) continue;
    const shock = scenario.shocks.find(
      s =>
        (s.symbol !== undefined && s.symbol === position.symbol) ||
        (s.assetClass !== undefined && s.assetClass === position.assetClass)
    );
    if (!shock) continue;
    const impact = position.value * shock.pctChange;
    totalImpact += impact;
    mostAffected.push({ symbol: position.symbol, impactValue: round(impact, 2) });
  }

  mostAffected.sort((a, b) => a.impactValue - b.impactValue); // biggest loss first

  return {
    id: scenario.id,
    label: scenario.label,
    portfolioImpactPct: round(totalImpact / metrics.pricedValue, 6),
    portfolioImpactValue: round(totalImpact, 2),
    stressedPortfolioValue: round(metrics.pricedValue + totalImpact, 2),
    mostAffectedHoldings: mostAffected.slice(0, 5),
    notes: `Cenário determinístico: ${scenario.description} Premissas declaradas nos choques; sem distribuições de probabilidade.`,
  };
}

export function runScenarios(
  scenarios: ScenarioDefinition[],
  metrics: PortfolioMetrics
): ScenarioResult[] {
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    const r = applyScenario(s, metrics);
    if (r) results.push(r);
  }
  return results;
}
