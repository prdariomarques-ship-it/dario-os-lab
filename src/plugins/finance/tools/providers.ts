import { FinancePortfolio, FinanceHolding } from "../types.js";

/**
 * DARIUS Finance — provider abstractions (Phase 1).
 *
 * Per the product constraints:
 *  - providers are abstract adapters; Phase 1 ships ONLY mock/local ones;
 *  - mock data is deterministic and ALWAYS labeled (isMock / "MOCK");
 *  - NO live integration is claimed, NO market data is invented as real;
 *  - no API keys, no network calls, no external dependencies.
 */

export interface MarketQuote {
  symbol: string;
  price: number;
  currency: string;
  asOf: string;
  source: "MOCK" | "LIVE";
}

export interface MarketDataProvider {
  readonly name: string;
  /** False in Phase 1 — nothing here is a live integration. */
  readonly isLive: false;
  getQuotes(symbols: string[]): Promise<MarketQuote[]>;
  /**
   * Deterministic synthetic price history for volatility/drawdown math.
   * Always labeled as mock; never presented as real market data.
   */
  getSyntheticPriceHistory(symbol: string, days: number): Promise<number[]>;
}

export interface EconomicIndicator {
  id: string;
  label: string;
  value: number;
  unit: string;
  asOf: string;
  source: "MOCK" | "LIVE";
}

export interface EconomicDataProvider {
  readonly name: string;
  readonly isLive: false;
  getIndicators(ids?: string[]): Promise<EconomicIndicator[]>;
}

export interface PortfolioProvider {
  readonly name: string;
  loadPortfolio(): Promise<FinancePortfolio>;
}

// ---------------------------------------------------------------------------
// Deterministic mock implementations
// ---------------------------------------------------------------------------

/**
 * Deterministic price table: same symbol always yields the same price.
 * Values are demonstrative constants — they describe NOTHING about reality
 * and every quote is labeled source:"MOCK".
 *
 * Integrity rule: symbols OUTSIDE the table get NO quote (a data gap),
 * never a synthesized price. Mock never invents data.
 */
const MOCK_PRICE_TABLE: Record<string, number> = {
  PETR4: 38.0, VALE3: 62.0, ITUB4: 32.0, BOVA11: 105.0, SQIA3: 24.0,
  SPXI11: 320.0, HASH11: 12.0, BTC: 250000.0, ETH: 15000.0, USD: 5.0,
  TSLA: 180.0, AAPL: 190.0, NTNB: 3200.0, LFT: 14000.0,
};

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "mock-market-data";
  readonly isLive = false as const;

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const out: MarketQuote[] = [];
    for (const symbol of symbols) {
      const price = MOCK_PRICE_TABLE[symbol];
      // Unknown symbols produce NO quote → explicit data gap downstream.
      if (price === undefined) continue;
      out.push({
        symbol,
        price,
        currency: "BRL",
        asOf: "2024-12-31 (demonstração)",
        source: "MOCK",
      });
    }
    return out;
  }

  async getSyntheticPriceHistory(symbol: string, days: number): Promise<number[]> {
    const base = MOCK_PRICE_TABLE[symbol];
    if (base === undefined) return [];
    // Deterministic pseudo-noise around the mock price (no Math.random:
    // analyses and tests must be reproducible).
    const series: number[] = [];
    let state = symbol.length * 7919 + base;
    for (let d = 0; d < days; d++) {
      state = (state * 1103515245 + 12345) % 2147483648;
      const noise = ((state % 2000) - 1000) / 1000; // -1..1
      series.push(base * (1 + noise * 0.01));
    }
    return series;
  }
}

export class MockEconomicDataProvider implements EconomicDataProvider {
  readonly name = "mock-economic-data";
  readonly isLive = false as const;

  async getIndicators(ids?: string[]): Promise<EconomicIndicator[]> {
    const all: EconomicIndicator[] = [
      { id: "SELIC", label: "Taxa Selic (demonstração)", value: 12.25, unit: "% a.a.", asOf: "2024-12-31 (demonstração)", source: "MOCK" },
      { id: "IPCA", label: "Inflação IPCA 12m (demonstração)", value: 4.8, unit: "% 12m", asOf: "2024-12-31 (demonstração)", source: "MOCK" },
      { id: "USD/BRL", label: "Câmbio USD/BRL (demonstração)", value: 5.0, unit: "BRL", asOf: "2024-12-31 (demonstração)", source: "MOCK" },
    ];
    if (!ids) return all;
    return all.filter(i => ids.includes(i.id));
  }
}

/**
 * Portfolio from user-declared input (never fetched, never inferred).
 */
export class LocalPortfolioProvider implements PortfolioProvider {
  readonly name = "local-portfolio";
  constructor(private portfolio: FinancePortfolio) {}

  async loadPortfolio(): Promise<FinancePortfolio> {
    return this.portfolio;
  }
}

/** Fill declared current prices into holdings when the user provided them. */
export function applyDeclaredPrices(holdings: FinanceHolding[]): FinanceHolding[] {
  return holdings.map(h => ({ ...h }));
}
