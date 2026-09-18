import {
  FinanceHolding,
  FinancePortfolio,
  PortfolioMetrics,
  ConcentrationLevel,
  PositionWeight,
  AssetClass,
  RiskMetrics,
} from "../types.js";
import { MarketQuote } from "./providers.js";

/**
 * DARIUS Finance — deterministic financial calculator.
 *
 * Pure functions, no randomness, no I/O. Every number in a report must be
 * reproducible from (portfolio, quotes). When data is missing, the result
 * carries an explicit gap — it NEVER invents prices.
 */

export function round(value: number, decimals = 6): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

/** Resolve the effective price for a holding: declared price or quote. */
export function resolvePrice(holding: FinanceHolding, quotes: MarketQuote[]): number | null {
  if (typeof holding.currentPrice === "number" && holding.currentPrice > 0) {
    return holding.currentPrice;
  }
  const q = quotes.find(x => x.symbol === holding.symbol);
  if (q && q.price > 0) return q.price;
  return null;
}

export function computeHHI(weights: number[]): number {
  return round(weights.reduce((acc, w) => acc + w * w, 0));
}

export function classifyConcentration(hhi: number, topWeight: number): ConcentrationLevel {
  if (topWeight > 0.5 || hhi >= 0.5) return "HIGHLY_CONCENTRATED";
  if (topWeight > 0.35 || hhi >= 0.25) return "CONCENTRATED";
  if (topWeight > 0.2 || hhi >= 0.15) return "MODERATELY_CONCENTRATED";
  return "DIVERSIFIED";
}

/**
 * Compute portfolio metrics from declared holdings + (optional) quotes.
 * Unpriced holdings are listed as data gaps; they are excluded from the
 * denominator and flagged — never valued with an invented price.
 */
export function calculatePortfolioMetrics(
  portfolio: FinancePortfolio,
  quotes: MarketQuote[]
): PortfolioMetrics {
  const positions: PositionWeight[] = [];
  const unpricedSymbols: string[] = [];
  let pricedValue = 0;

  for (const h of portfolio.holdings) {
    const price = resolvePrice(h, quotes);
    if (price === null) {
      unpricedSymbols.push(h.symbol);
      positions.push({
        symbol: h.symbol,
        assetClass: h.assetClass,
        value: 0,
        weight: 0,
        priced: false,
      });
      continue;
    }
    const value = h.quantity * price;
    pricedValue += value;
    positions.push({
      symbol: h.symbol,
      assetClass: h.assetClass,
      value: round(value, 2),
      weight: 0, // filled after total
      priced: true,
    });
  }

  if (pricedValue > 0) {
    for (const p of positions) {
      if (p.priced) p.weight = round(p.value / pricedValue, 6);
    }
  }

  const pricedWeights = positions.filter(p => p.priced).map(p => p.weight);
  const concentrationHHI = computeHHI(pricedWeights);
  const topPosition =
    positions.filter(p => p.priced).sort((a, b) => b.weight - a.weight)[0] ?? null;
  const topWeight = topPosition ? topPosition.weight : 0;

  // Asset-class allocation over priced positions.
  const classMap = new Map<AssetClass, number>();
  for (const p of positions) {
    if (!p.priced) continue;
    classMap.set(p.assetClass, (classMap.get(p.assetClass) ?? 0) + p.value);
  }
  const assetClassAllocation = Array.from(classMap.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      value: round(value, 2),
      weight: pricedValue > 0 ? round(value / pricedValue, 6) : 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    baseCurrency: portfolio.baseCurrency,
    pricedValue: round(pricedValue, 2),
    unpricedSymbols,
    positions,
    concentrationHHI,
    topPosition,
    topWeight,
    assetClassAllocation,
    concentrationLevel: classifyConcentration(concentrationHHI, topWeight),
    effectiveNumberOfAssets: concentrationHHI > 0 ? round(1 / concentrationHHI, 2) : 0,
  };
}

// ---------------------------------------------------------------------------
// Risk math (requires a price series; deterministic synthetic series in Phase 1)
// ---------------------------------------------------------------------------

export function dailyReturns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i - 1] > 0) out.push(series[i] / series[i - 1] - 1);
  }
  return out;
}

export function annualizedVolatility(series: number[]): number | null {
  const rets = dailyReturns(series);
  if (rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (rets.length - 1);
  const daily = Math.sqrt(variance);
  return round(daily * Math.sqrt(252), 6);
}

export function maxDrawdown(series: number[]): number | null {
  if (series.length < 2) return null;
  let peak = series[0];
  let mdd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > mdd) mdd = dd;
  }
  return round(mdd, 6);
}

/** Parametric (gaussian) approximation — explicitly labeled as approximation. */
export function parametricVaR(
  portfolioValue: number,
  annualVol: number,
  horizonDays: number,
  z: number
): number | null {
  if (portfolioValue <= 0 || annualVol === null || annualVol === undefined) return null;
  const dailyVol = annualVol / Math.sqrt(252);
  const varValue = portfolioValue * dailyVol * z * Math.sqrt(horizonDays);
  return round(varValue, 2);
}

export function computeRiskMetrics(
  metrics: PortfolioMetrics,
  blendedSeries: number[],
  horizonDays = 21
): RiskMetrics {
  const annualVol = annualizedVolatility(blendedSeries);
  const mdd = maxDrawdown(blendedSeries);
  const notes: string[] = [
    "Volatilidade/drawdown calculados sobre série sintética determinística (demonstração) — não representam histórico real de mercado.",
    "VaR paramétrico gaussiano: aproximação; subestima caudas e ignora assimetria.",
  ];
  if (metrics.pricedValue <= 0) {
    notes.push("Carteira sem posições precificadas: métricas de risco indisponíveis.");
  }
  const dailyVol = annualVol !== null ? round(annualVol / Math.sqrt(252), 6) : null;
  return {
    annualizedVolatility: annualVol,
    maxDrawdown: mdd,
    dailyVolatility: dailyVol,
    var95Approx: annualVol !== null ? parametricVaR(metrics.pricedValue, annualVol, horizonDays, 1.645) : null,
    var99Approx: annualVol !== null ? parametricVaR(metrics.pricedValue, annualVol, horizonDays, 2.326) : null,
    horizonDays,
    notes,
  };
}
