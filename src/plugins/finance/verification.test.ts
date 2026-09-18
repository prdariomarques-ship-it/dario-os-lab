import { describe, it, expect } from "vitest";
import { Task } from "../../core/types.js";
import {
  verifyFinanceReportSchema,
  verifyFinanceMathConsistency,
  verifyFinanceNoMissingData,
  verifyFinanceCriticGate,
} from "./verification/verifiers.js";
import { FinanceAnalysisReport } from "./types.js";

function fakeTask(): Task {
  return {
    id: "task-1",
    objective: "test",
    status: "RUNNING",
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };
}

function validReport(): FinanceAnalysisReport {
  return {
    taskType: "FINANCE_PORTFOLIO_ANALYSIS",
    generatedAt: new Date().toISOString(),
    dataSource: "MOCK_DEMO_DATA",
    portfolioSummary: {
      baseCurrency: "BRL",
      pricedValue: 1000,
      unpricedSymbols: [],
      holdings: [
        { symbol: "PETR4", assetClass: "EQUITY", quantity: 10, value: 600, weight: 0.6 },
        { symbol: "VALE3", assetClass: "EQUITY", quantity: 4, value: 400, weight: 0.4 },
      ],
      concentrationHHI: 0.52,
      concentrationLevel: "HIGHLY_CONCENTRATED",
      topWeight: 0.6,
      assetClassAllocation: [{ assetClass: "EQUITY", value: 1000, weight: 1 }],
    },
    riskSummary: null,
    macroSnapshot: [],
    findings: [{
      area: "CONCENTRATION",
      severity: "HIGH",
      statement: "Concentrado",
      evidenceIds: ["EV-1"],
      assumptions: ["a"],
      uncertainties: ["u"],
    }],
    scenarios: [],
    openQuestions: ["q"],
    dataGaps: [],
    assumptions: ["a"],
    hypotheticalActions: [],
    criticObjections: [{ id: "C1", target: "t", objection: "o", addressed: true, resolution: "r" }],
    confidence: 0.8,
    disclaimers: ["Contém dados de DEMONSTRAÇÃO (mock determinístico rotulado)."],
  };
}

describe("finance verification gates", () => {
  it("schema: accepts a complete report, rejects incomplete", async () => {
    const ok = await verifyFinanceReportSchema(fakeTask(), JSON.stringify(validReport()));
    expect(ok.passed).toBe(true);

    const broken = validReport() as unknown as Record<string, unknown>;
    delete broken.findings;
    expect((await verifyFinanceReportSchema(fakeTask(), JSON.stringify(broken))).passed).toBe(false);
    expect((await verifyFinanceReportSchema(fakeTask(), "not json")).passed).toBe(false);
  });

  it("math: recomputes HHI/top/weights from holdings", async () => {
    const report = validReport();
    expect((await verifyFinanceMathConsistency(fakeTask(), JSON.stringify(report))).passed).toBe(true);

    const tampered = validReport();
    tampered.portfolioSummary.concentrationHHI = 0.1; // wrong on purpose
    const r = await verifyFinanceMathConsistency(fakeTask(), JSON.stringify(tampered));
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/HHI mismatch/);

    const badWeights = validReport();
    badWeights.portfolioSummary.holdings[0].weight = 0.9;
    expect((await verifyFinanceMathConsistency(fakeTask(), JSON.stringify(badWeights))).passed).toBe(false);
  });

  it("no-missing-data: unpriced symbols must be declared; confidence capped", async () => {
    const report = validReport();
    report.portfolioSummary.unpricedSymbols = ["XPTO"];
    report.dataGaps = ["Preço ausente: XPTO"];
    report.confidence = 0.6;
    expect((await verifyFinanceNoMissingData(fakeTask(), JSON.stringify(report))).passed).toBe(true);

    const hidden = validReport();
    hidden.portfolioSummary.unpricedSymbols = ["XPTO"];
    hidden.dataGaps = [];
    const r = await verifyFinanceNoMissingData(fakeTask(), JSON.stringify(hidden));
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/not declared in dataGaps/);

    const overconfident = validReport();
    overconfident.dataGaps = ["gap"];
    overconfident.confidence = 0.9;
    expect((await verifyFinanceNoMissingData(fakeTask(), JSON.stringify(overconfident))).passed).toBe(false);
  });

  it("no-missing-data: mock usage must be disclosed", async () => {
    const report = validReport();
    report.disclaimers = ["Nada a declarar"];
    const r = await verifyFinanceNoMissingData(fakeTask(), JSON.stringify(report));
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/Mock\/demo data used but not disclosed/);
  });

  it("critic gate: unaddressed objections block completion", async () => {
    expect((await verifyFinanceCriticGate(fakeTask(), JSON.stringify(validReport()))).passed).toBe(true);

    const report = validReport();
    report.criticObjections = [{ id: "C9", target: "t", objection: "o", addressed: false }];
    const r = await verifyFinanceCriticGate(fakeTask(), JSON.stringify(report));
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/Unaddressed critic objections/);
  });
});
