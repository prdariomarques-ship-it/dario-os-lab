import { VerificationCriteria } from "../../verification/types.js";

/**
 * DARIUS Finance — domain types.
 *
 * This vertical adds NO new task system, NO new planner and NO new runtime.
 * Everything here maps onto the existing DARIUS Core contracts:
 *  - Tasks use the existing `Task.metadata` bag (see buildFinanceTaskMetadata).
 *  - Agents implement the existing `Agent` (observe/think/act) interface.
 *  - Tools implement the existing `Tool` interface (risk/schema/validate).
 *  - Skills implement the existing `Skill` interface.
 *  - Verification uses `VerificationCriteria` (CUSTOM verifiers) from Core.
 */

export const FINANCE_TASK_TYPE = "FINANCE_PORTFOLIO_ANALYSIS" as const;

// ---------------------------------------------------------------------------
// Portfolio domain
// ---------------------------------------------------------------------------

export type AssetClass =
  | "EQUITY"
  | "FIXED_INCOME"
  | "CRYPTO"
  | "CASH"
  | "FUND"
  | "REIT"
  | "COMMODITY"
  | "OTHER";

export interface FinanceHolding {
  symbol: string;
  assetClass: AssetClass;
  quantity: number;
  /** Average cost per unit, when available. Never invented. */
  avgCost?: number;
  /** Current price per unit, when available. Never invented. */
  currentPrice?: number;
  currency?: string;
}

export interface FinancePortfolio {
  baseCurrency: string;
  holdings: FinanceHolding[];
  /** Total wealth including non-portfolio assets, when declared. */
  totalWealth?: number;
}

export type RiskTolerance = "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" | "UNKNOWN";

export interface FinanceRiskProfile {
  declaredTolerance: RiskTolerance;
  /** Investment horizon in months, when declared. */
  horizonMonths?: number;
  objective?: string;
  constraints: string[];
}

export interface FinanceTaskInput {
  portfolio: FinancePortfolio;
  riskProfile: FinanceRiskProfile;
  /** Explicit user questions to be answered by the analysis. */
  questions?: string[];
}

// ---------------------------------------------------------------------------
// Evidence & findings
// ---------------------------------------------------------------------------

export type EvidenceKind =
  | "MARKET_DATA"
  | "PORTFOLIO_DATA"
  | "CALCULATION"
  | "SCENARIO"
  | "MACRO"
  | "USER_DECLARED"
  | "MODEL_INFERENCE";

export interface FinanceEvidence {
  id: string;
  source: string;
  kind: EvidenceKind;
  content: string;
  dataAsOf?: string;
  /** 0..1 */
  confidence: number;
  /** True when produced by the deterministic mock/demo providers. */
  isMock: boolean;
}

export type FindingArea =
  | "CONCENTRATION"
  | "RISK"
  | "MACRO"
  | "MARKET"
  | "TAX"
  | "DATA_QUALITY"
  | "GENERAL";

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface FinanceFinding {
  area: FindingArea;
  severity: Severity;
  statement: string;
  evidenceIds: string[];
  assumptions: string[];
  uncertainties: string[];
}

/**
 * A hypothetical action is a PROPOSAL only. It never executes.
 * Phase 3 (broker integrations / authorized execution) is out of scope.
 */
export interface HypotheticalAction {
  description: string;
  rationale: string;
  riskLevel: Severity;
  requiresApproval: true;
  status: "PROPOSED" | "APPROVED" | "REJECTED";
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export interface ScenarioShock {
  /** Apply shock to all holdings of this asset class (or a specific symbol). */
  assetClass?: AssetClass;
  symbol?: string;
  /** Percentage change applied to position value, e.g. -0.5 = -50%. */
  pctChange: number;
}

export interface ScenarioDefinition {
  id: string;
  label: string;
  description: string;
  shocks: ScenarioShock[];
}

export interface ScenarioResult {
  id: string;
  label: string;
  portfolioImpactPct: number;
  portfolioImpactValue: number;
  stressedPortfolioValue: number;
  mostAffectedHoldings: Array<{ symbol: string; impactValue: number }>;
  notes: string;
}

// ---------------------------------------------------------------------------
// Portfolio metrics (deterministic calculator output)
// ---------------------------------------------------------------------------

export interface PositionWeight {
  symbol: string;
  assetClass: AssetClass;
  value: number;
  weight: number;
  priced: boolean;
}

export type ConcentrationLevel =
  | "DIVERSIFIED"
  | "MODERATELY_CONCENTRATED"
  | "CONCENTRATED"
  | "HIGHLY_CONCENTRATED";

export interface PortfolioMetrics {
  baseCurrency: string;
  pricedValue: number;
  unpricedSymbols: string[];
  positions: PositionWeight[];
  /** Herfindahl–Hirschman Index over priced weights (0..1). */
  concentrationHHI: number;
  topPosition: PositionWeight | null;
  topWeight: number;
  assetClassAllocation: Array<{ assetClass: AssetClass; weight: number; value: number }>;
  concentrationLevel: ConcentrationLevel;
  effectiveNumberOfAssets: number;
}

export interface RiskMetrics {
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  dailyVolatility: number | null;
  var95Approx: number | null;
  var99Approx: number | null;
  horizonDays: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Final report
// ---------------------------------------------------------------------------

export interface CriticObjection {
  id: string;
  target: string;
  objection: string;
  addressed: boolean;
  resolution?: string;
}

export interface FinanceAnalysisReport {
  taskType: typeof FINANCE_TASK_TYPE;
  generatedAt: string;
  dataSource: "MOCK_DEMO_DATA" | "USER_DECLARED" | "MIXED";
  portfolioSummary: {
    baseCurrency: string;
    pricedValue: number;
    unpricedSymbols: string[];
    holdings: Array<{
      symbol: string;
      assetClass: AssetClass;
      quantity: number;
      value?: number;
      weight?: number;
    }>;
    concentrationHHI: number;
    concentrationLevel: ConcentrationLevel;
    topWeight: number;
    assetClassAllocation: Array<{ assetClass: AssetClass; weight: number; value: number }>;
  };
  riskSummary: RiskMetrics | null;
  macroSnapshot: Array<{ id: string; label: string; value: number; unit: string; isMock: boolean }>;
  findings: FinanceFinding[];
  scenarios: ScenarioResult[];
  openQuestions: string[];
  dataGaps: string[];
  assumptions: string[];
  hypotheticalActions: HypotheticalAction[];
  criticObjections: CriticObjection[];
  /** 0..1 — deliberately capped below 1 whenever data gaps exist. */
  confidence: number;
  narrative?: string;
  disclaimers: string[];
}

// ---------------------------------------------------------------------------
// FINANCE_PORTFOLIO_ANALYSIS task spec (maps onto existing Task.metadata)
// ---------------------------------------------------------------------------

export interface FinanceApprovalPolicy {
  required: boolean;
  gate: "WAITING_APPROVAL";
  onReject: "CANCEL";
}

export interface FinanceModelHints {
  /** Capability names for the existing ModelRouter, NOT provider names. */
  research?: string;
  reasoning?: string;
  critic?: string;
}

export interface FinanceTaskSpec {
  type: typeof FINANCE_TASK_TYPE;
  objective: string;
  context?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dependencies: string[];
  tools: string[];
  skills: string[];
  agents: string[];
  model: FinanceModelHints;
  risk: { level: Severity; approvalRequired: boolean };
  budget: { maxIterations: number; maxRetries: number };
  timeoutMs: number;
  successCriteria: string;
  verification: VerificationCriteria[];
  approvalPolicy: FinanceApprovalPolicy;
  artifacts: string[];
}

/**
 * Build the `Task.metadata` payload for a FINANCE_PORTFOLIO_ANALYSIS task.
 * Uses ONLY fields the existing TaskEngine/VerificationEngine understand:
 *  - metadata.verification  → DeterministicVerificationEngine criteria
 *  - metadata.maxRetries    → engine retry loop
 *  - metadata.successCriteria
 * The full FinanceTaskSpec is preserved under metadata.finance for auditability.
 */
export function buildFinanceTaskMetadata(spec: FinanceTaskSpec): Record<string, unknown> {
  return {
    type: spec.type,
    successCriteria: spec.successCriteria,
    verification: spec.verification,
    maxRetries: spec.budget.maxRetries,
    finance: spec,
  };
}

// ---------------------------------------------------------------------------
// Approval decisions (stored in the existing MemoryStore — never in code)
// ---------------------------------------------------------------------------

export interface ApprovalDecision {
  taskId: string;
  decision: "APPROVED" | "REJECTED";
  approver: string;
  reason?: string;
  decidedAt: string;
}
