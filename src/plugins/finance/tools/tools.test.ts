import { describe, it, expect } from "vitest";
import { MockMarketDataProvider, MockEconomicDataProvider } from "./providers.js";
import {
  calculatePortfolioMetrics,
  computeHHI,
  classifyConcentration,
  annualizedVolatility,
  maxDrawdown,
  parametricVaR,
  computeRiskMetrics,
} from "./calculator.js";
import { applyScenario, runScenarios, DEFAULT_SCENARIOS } from "./simulation.js";
import { FinancePortfolio } from "../types.js";

describe("MockMarketDataProvider", () => {
  it("returns deterministic MOCK quotes for known symbols", async () => {
    const p = new MockMarketDataProvider();
    const a = await p.getQuotes(["PETR4", "BTC"]);
    const b = await p.getQuotes(["PETR4", "BTC"]);
    expect(p.isLive).toBe(false);
    expect(a.map(q => ({ symbol: q.symbol, price: q.price })))
      .toEqual(b.map(q => ({ symbol: q.symbol, price: q.price })));
    expect(a.every(q => q.source === "MOCK")).toBe(true);
  });

  it("NEVER invents quotes for unknown symbols (explicit data gap)", async () => {
    const p = new MockMarketDataProvider();
    const quotes = await p.getQuotes(["PETR4", "XPTO_DESCONHECIDO"]);
    expect(quotes.map(q => q.symbol)).toEqual(["PETR4"]);
  });

  it("produces deterministic synthetic history without randomness", async () => {
    const p = new MockMarketDataProvider();
    const a = await p.getSyntheticPriceHistory("VALE3", 50);
    const b = await p.getSyntheticPriceHistory("VALE3", 50);
    expect(a).toEqual(b);
    expect(a).toHaveLength(50);
  });
});

describe("MockEconomicDataProvider", () => {
  it("lists rotulado (MOCK) macro indicators", async () => {
    const p = new MockEconomicDataProvider();
    const all = await p.getIndicators();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.every(i => i.source === "MOCK")).toBe(true);
    const filtered = await p.getIndicators(["SELIC"]);
    expect(filtered.map(i => i.id)).toEqual(["SELIC"]);
  });
});

describe("calculator", () => {
  const portfolio: FinancePortfolio = {
    baseCurrency: "BRL",
    holdings: [
      { symbol: "PETR4", assetClass: "EQUITY", quantity: 100 },
      { symbol: "VALE3", assetClass: "EQUITY", quantity: 100 },
      { symbol: "BTC", assetClass: "CRYPTO", quantity: 0.01 },
    ],
  };

  it("computes weights summing to 1 over priced positions", async () => {
    const p = new MockMarketDataProvider();
    const quotes = await p.getQuotes(portfolio.holdings.map(h => h.symbol));
    const m = calculatePortfolioMetrics(portfolio, quotes);
    const sum = m.positions.filter(x => x.priced).reduce((a, x) => a + x.weight, 0);
    expect(sum).toBeCloseTo(1, 4);
    expect(m.pricedValue).toBe(100 * 38 + 100 * 62 + 0.01 * 250000);
  });

  it("flags unpriced holdings as data gaps instead of inventing values", async () => {
    const p = new MockMarketDataProvider();
    const quotes = await p.getQuotes(portfolio.holdings.map(h => h.symbol)); // BTC quote missing on purpose
    const m = calculatePortfolioMetrics(portfolio, quotes.filter(q => q.symbol !== "BTC"));
    expect(m.unpricedSymbols).toEqual(["BTC"]);
    expect(m.positions.find(x => x.symbol === "BTC")?.priced).toBe(false);
    expect(m.positions.find(x => x.symbol === "PETR4")?.priced).toBe(true);
  });

  it("prefers user-declared currentPrice over provider quotes", async () => {
    const p = new MockMarketDataProvider();
    const quotes = await p.getQuotes(["PETR4"]);
    const m = calculatePortfolioMetrics(
      { baseCurrency: "BRL", holdings: [{ symbol: "PETR4", assetClass: "EQUITY", quantity: 10, currentPrice: 50 }] },
      quotes
    );
    expect(m.pricedValue).toBe(500);
  });

  it("classifies concentration correctly", () => {
    expect(computeHHI([0.5, 0.5])).toBeCloseTo(0.5, 6);
    expect(classifyConcentration(0.5, 0.5)).toBe("HIGHLY_CONCENTRATED");
    expect(classifyConcentration(1 / 3, 1 / 3)).toBe("CONCENTRATED");
    expect(classifyConcentration(0.2, 0.2)).toBe("MODERATELY_CONCENTRATED");
    expect(classifyConcentration(0.1, 0.15)).toBe("DIVERSIFIED");
  });

  it("computes risk metrics on deterministic series", () => {
    const flat = [100, 100, 100, 100];
    expect(annualizedVolatility(flat)).toBe(0);
    expect(maxDrawdown(flat)).toBe(0);

    const down = [100, 90, 80];
    expect(maxDrawdown(down)).toBeCloseTo(0.2, 6);

    const vol = annualizedVolatility([100, 110, 95, 105, 90]);
    expect(vol).toBeGreaterThan(0);

    const var95 = parametricVaR(100000, vol as number, 21, 1.645);
    expect(var95).toBeGreaterThan(0);
  });

  it("returns unavailable risk when portfolio has no priced value", () => {
    const r = computeRiskMetrics(
      { baseCurrency: "BRL", pricedValue: 0, unpricedSymbols: ["X"], positions: [], concentrationHHI: 0, topPosition: null, topWeight: 0, assetClassAllocation: [], concentrationLevel: "HIGHLY_CONCENTRATED", effectiveNumberOfAssets: 0 },
      []
    );
    expect(r.annualizedVolatility).toBeNull();
    expect(r.var95Approx).toBeNull();
    expect(r.notes.some(n => n.includes("sem posições precificadas"))).toBe(true);
  });
});

describe("scenario simulator", () => {
  it("applies deterministic class shocks", async () => {
    const p = new MockMarketDataProvider();
    const portfolio: FinancePortfolio = {
      baseCurrency: "BRL",
      holdings: [
        { symbol: "PETR4", assetClass: "EQUITY", quantity: 100 },   // 3800
        { symbol: "BTC", assetClass: "CRYPTO", quantity: 0.01 },    // 2500
      ],
    };
    const quotes = await p.getQuotes(portfolio.holdings.map(h => h.symbol));
    const m = calculatePortfolioMetrics(portfolio, quotes);
    const crash = applyScenario(DEFAULT_SCENARIOS[1], m); // CRYPTO_CRASH_50
    expect(crash).not.toBeNull();
    expect(crash!.portfolioImpactValue).toBeCloseTo(-1250, 2);
    expect(crash!.stressedPortfolioValue).toBeCloseTo(6300 - 1250, 2);
    expect(crash!.mostAffectedHoldings[0].symbol).toBe("BTC");
  });

  it("runs the default scenario suite and sorts worst first in findings", async () => {
    const p = new MockMarketDataProvider();
    const portfolio: FinancePortfolio = {
      baseCurrency: "BRL",
      holdings: [{ symbol: "BOVA11", assetClass: "EQUITY", quantity: 10 }],
    };
    const quotes = await p.getQuotes(portfolio.holdings.map(h => h.symbol));
    const m = calculatePortfolioMetrics(portfolio, quotes);
    const results = runScenarios(DEFAULT_SCENARIOS, m);
    expect(results.length).toBe(DEFAULT_SCENARIOS.length);
    const equity = results.find(r => r.id === "EQUITY_BEAR_30");
    expect(equity!.portfolioImpactPct).toBeCloseTo(-0.3, 6);
  });

  it("returns null scenario impact for a fully unpriced portfolio", () => {
    const empty = {
      baseCurrency: "BRL", pricedValue: 0, unpricedSymbols: [], positions: [],
      concentrationHHI: 0, topPosition: null, topWeight: 0,
      assetClassAllocation: [], concentrationLevel: "HIGHLY_CONCENTRATED" as const,
      effectiveNumberOfAssets: 0,
    };
    expect(applyScenario(DEFAULT_SCENARIOS[0], empty)).toBeNull();
  });
});
