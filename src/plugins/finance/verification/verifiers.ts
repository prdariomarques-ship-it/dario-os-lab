import { Task } from "../../../core/types.js";
import { VerificationResult } from "../../../verification/types.js";
import { FinanceAnalysisReport, PortfolioMetrics } from "../types.js";
import { computeHHI, classifyConcentration, round } from "../tools/calculator.js";

/**
 * DARIUS Finance — deterministic custom verifiers.
 *
 * These are registered into the EXISTING DeterministicVerificationEngine
 * via registerCustomVerifier(), so NO finance analysis can complete without
 * passing the finance verification gates. Verifier contract:
 *   (task, agentResult) => Promise<VerificationResult>
 */

export const FINANCE_VERIFIERS = {
  reportSchema: "finance_report_schema",
  mathConsistency: "finance_math_consistency",
  noMissingData: "finance_no_missing_data",
  criticGate: "finance_critic_gate",
} as const;

export function parseReport(agentResult: string): FinanceAnalysisReport | null {
  try {
    const start = agentResult.indexOf("{");
    const end = agentResult.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(agentResult.slice(start, end + 1)) as FinanceAnalysisReport;
  } catch {
    return null;
  }
}

const REQUIRED_REPORT_KEYS: Array<keyof FinanceAnalysisReport> = [
  "taskType",
  "generatedAt",
  "dataSource",
  "portfolioSummary",
  "findings",
  "scenarios",
  "openQuestions",
  "dataGaps",
  "assumptions",
  "hypotheticalActions",
  "criticObjections",
  "confidence",
  "disclaimers",
];

/** 1) The final result must be a structurally complete finance report. */
export async function verifyFinanceReportSchema(
  _task: Task,
  agentResult: string
): Promise<VerificationResult> {
  const report = parseReport(agentResult);
  if (!report) {
    return { passed: false, reason: "Result is not a parseable FinanceAnalysisReport JSON" };
  }
  const missing = REQUIRED_REPORT_KEYS.filter(k => !(k in report));
  if (missing.length > 0) {
    return { passed: false, reason: `Report missing required keys: ${missing.join(", ")}` };
  }
  if (report.taskType !== "FINANCE_PORTFOLIO_ANALYSIS") {
    return { passed: false, reason: `Wrong taskType: ${report.taskType}` };
  }
  return { passed: true, evidence: { keysChecked: REQUIRED_REPORT_KEYS.length } };
}

/** 2) Reported portfolio math must match recomputation from the holdings. */
export async function verifyFinanceMathConsistency(
  _task: Task,
  agentResult: string
): Promise<VerificationResult> {
  const report = parseReport(agentResult);
  if (!report) return { passed: false, reason: "Unparseable report for math verification" };

  const holdings = report.portfolioSummary.holdings;
  const priced = holdings.filter(h => typeof h.value === "number" && typeof h.weight === "number");
  const totalValue = priced.reduce((a, h) => a + (h.value as number), 0);

  if (totalValue > 0) {
    const weightSum = priced.reduce((a, h) => a + (h.weight as number), 0);
    if (Math.abs(weightSum - 1) > 0.01) {
      return { passed: false, reason: `Weights sum to ${weightSum}, expected ~1` };
    }
    const recomputedHHI = computeHHI(priced.map(h => h.weight as number));
    if (Math.abs(recomputedHHI - report.portfolioSummary.concentrationHHI) > 0.02) {
      return {
        passed: false,
        reason: `HHI mismatch: reported ${report.portfolioSummary.concentrationHHI}, recomputed ${recomputedHHI}`,
      };
    }
    const topWeight = Math.max(...priced.map(h => h.weight as number));
    if (Math.abs(topWeight - report.portfolioSummary.topWeight) > 0.01) {
      return { passed: false, reason: `Top weight mismatch: reported ${report.portfolioSummary.topWeight}, recomputed ${topWeight}` };
    }
    const expectedLevel = classifyConcentration(recomputedHHI, topWeight);
    if (expectedLevel !== report.portfolioSummary.concentrationLevel) {
      return { passed: false, reason: `Concentration level mismatch: reported ${report.portfolioSummary.concentrationLevel}, recomputed ${expectedLevel}` };
    }
    // Per-position value/weight coherence.
    for (const h of priced) {
      const expectedW = round((h.value as number) / totalValue, 4);
      if (Math.abs(expectedW - (h.weight as number)) > 0.01) {
        return { passed: false, reason: `Weight of ${h.symbol} inconsistent with its value share` };
      }
    }
  }
  return { passed: true, evidence: { pricedPositions: priced.length, totalValue } };
}

/** 3) Missing data must be explicitly declared — never hidden, never filled. */
export async function verifyFinanceNoMissingData(
  _task: Task,
  agentResult: string
): Promise<VerificationResult> {
  const report = parseReport(agentResult);
  if (!report) return { passed: false, reason: "Unparseable report for missing-data verification" };

  const unpriced = report.portfolioSummary.unpricedSymbols;
  const holdingsWithoutWeight = report.portfolioSummary.holdings
    .filter(h => h.weight === undefined)
    .map(h => h.symbol);
  const declared = (s: string) => report.dataGaps.some(g => g.includes(s));

  const undeclared = Array.from(new Set([...unpriced, ...holdingsWithoutWeight])).filter(s => !declared(s));
  if (undeclared.length > 0) {
    return {
      passed: false,
      reason: `Unpriced symbols ${undeclared.join(", ")} are not declared in dataGaps`,
    };
  }
  if (report.dataGaps.length > 0 && report.confidence >= 0.85) {
    return {
      passed: false,
      reason: `Confidence ${report.confidence} is too high given ${report.dataGaps.length} declared data gap(s)`,
    };
  }
  if (report.confidence < 0 || report.confidence > 1) {
    return { passed: false, reason: `Confidence out of range [0,1]: ${report.confidence}` };
  }
  const mockDataUsed =
    report.dataSource === "MOCK_DEMO_DATA" || report.dataSource === "MIXED";
  if (mockDataUsed && !report.disclaimers.some(d => d.toLowerCase().includes("demonstra"))) {
    return { passed: false, reason: "Mock/demo data used but not disclosed in disclaimers" };
  }
  return { passed: true, evidence: { dataGaps: report.dataGaps.length, dataSource: report.dataSource } };
}

/** 4) The Critic stage must have actually run and produced objections review. */
export async function verifyFinanceCriticGate(
  _task: Task,
  agentResult: string
): Promise<VerificationResult> {
  const report = parseReport(agentResult);
  if (!report) return { passed: false, reason: "Unparseable report for critic gate" };
  if (!Array.isArray(report.criticObjections)) {
    return { passed: false, reason: "criticObjections missing — critic stage did not run" };
  }
  const unaddressed = report.criticObjections.filter(o => !o.addressed);
  if (unaddressed.length > 0) {
    return {
      passed: false,
      reason: `Unaddressed critic objections: ${unaddressed.map(o => o.id).join(", ")}`,
    };
  }
  return { passed: true, evidence: { objections: report.criticObjections.length } };
}

export function createFinanceVerifierFactories() {
  return [
    { id: FINANCE_VERIFIERS.reportSchema, fn: verifyFinanceReportSchema },
    { id: FINANCE_VERIFIERS.mathConsistency, fn: verifyFinanceMathConsistency },
    { id: FINANCE_VERIFIERS.noMissingData, fn: verifyFinanceNoMissingData },
    { id: FINANCE_VERIFIERS.criticGate, fn: verifyFinanceCriticGate },
  ];
}

export type { PortfolioMetrics };
