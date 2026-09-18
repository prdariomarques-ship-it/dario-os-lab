import { describe, it, expect } from "vitest";
import { SimpleToolEngine } from "../../tools/engine.js";
import { createFinanceTools, FINANCE_TOOLS } from "./tools/index.js";
import {
  createFinanceSkills,
  FINANCE_SKILLS,
  ResearchOutput,
} from "./skills/index.js";
import { FinanceTaskInput, FinanceAnalysisReport } from "./types.js";

function setup() {
  const toolEngine = new SimpleToolEngine();
  const bundle = createFinanceTools();
  for (const t of bundle.tools) toolEngine.register(t);
  const skills = createFinanceSkills(toolEngine);
  const skillEngine = {
    skills: new Map(skills.map(s => [s.id, s])),
    async executeSkill(id: string, params: unknown, context: unknown) {
      const skill = this.skills.get(id);
      if (!skill) throw new Error(`Skill ${id} not found`);
      if (skill.preconditions && !skill.preconditions(context)) {
        throw new Error(`Preconditions failed for skill ${id}`);
      }
      return skill.execute(params, context);
    },
  };
  return { toolEngine, skills, skillEngine, bundle };
}

const fullInput: FinanceTaskInput = {
  portfolio: {
    baseCurrency: "BRL",
    holdings: [
      { symbol: "PETR4", assetClass: "EQUITY", quantity: 100 },      // 3.800
      { symbol: "BTC", assetClass: "CRYPTO", quantity: 0.01 },       // 2.500
      { symbol: "LFT", assetClass: "FIXED_INCOME", quantity: 1 },    // 14.000
      { symbol: "XPTO", assetClass: "OTHER", quantity: 5 },          // sem preço
    ],
  },
  riskProfile: { declaredTolerance: "CONSERVATIVE", constraints: ["Sem cripto"] },
  questions: ["Estou exposto demais a cripto?"],
};

describe("finance skills", () => {
  it("registers the full skill directory", () => {
    const { skills } = setup();
    expect(skills.map(s => s.id).sort()).toEqual([
      FINANCE_SKILLS.criticReview,
      FINANCE_SKILLS.financialReport,
      FINANCE_SKILLS.macroSnapshot,
      FINANCE_SKILLS.marketResearch,
      FINANCE_SKILLS.portfolioAnalysis,
      FINANCE_SKILLS.riskAnalysis,
      FINANCE_SKILLS.scenarioAnalysis,
      "finance-tax-review",
    ].sort());
  });

  it("market research returns rotulado evidence and reports the data gap", async () => {
    const { skillEngine } = setup();
    const out = (await skillEngine.executeSkill(FINANCE_SKILLS.marketResearch, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput;
    expect(out.area).toBe("MARKET");
    expect(out.evidence.every(e => e.isMock)).toBe(true);
    expect(out.dataGaps.some(g => g.includes("XPTO"))).toBe(true);
    expect(out.findings.some(f => f.area === "DATA_QUALITY" && f.statement.includes("XPTO"))).toBe(true);
  });

  it("portfolio analysis computes deterministic metrics and hypothetical action", async () => {
    const { skillEngine } = setup();
    const out = (await skillEngine.executeSkill(FINANCE_SKILLS.portfolioAnalysis, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput;
    expect(out.metrics).toBeDefined();
    // priced value = 3800 + 2500 + 14000 = 20300; BTC = 2500/20300 ≈ 12.3%
    expect(out.metrics!.pricedValue).toBe(20300);
    expect(out.metrics!.unpricedSymbols).toEqual(["XPTO"]);
    expect(out.area).toBe("PORTFOLIO");
  });

  it("risk analysis flags crypto exposure for conservative profile", async () => {
    const { skillEngine } = setup();
    const out = (await skillEngine.executeSkill(FINANCE_SKILLS.riskAnalysis, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput;
    expect(out.findings.some(f => f.area === "RISK" && f.severity === "HIGH" && f.statement.includes("cripto"))).toBe(true);
    expect(out.findings.some(f => f.statement.includes("conservador"))).toBe(true);
    expect(out.risk).toBeDefined();
  });

  it("scenario analysis produces deterministic scenarios", async () => {
    const { skillEngine } = setup();
    const out = (await skillEngine.executeSkill(FINANCE_SKILLS.scenarioAnalysis, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput;
    expect(out.scenarios!.length).toBeGreaterThanOrEqual(3);
    expect(out.scenarios!.every(s => typeof s.portfolioImpactPct === "number")).toBe(true);
  });

  it("tax review declares gaps when no cost data exists", async () => {
    const { skillEngine } = setup();
    const out = (await skillEngine.executeSkill("finance-tax-review", { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput;
    expect(out.dataGaps[0]).toContain("preço médio");
    expect(out.findings[0].area).toBe("TAX");
  });

  it("tax review computes unrealized P&L when cost is declared", async () => {
    const { skillEngine } = setup();
    const input: FinanceTaskInput = {
      portfolio: {
        baseCurrency: "BRL",
        holdings: [{ symbol: "PETR4", assetClass: "EQUITY", quantity: 100, avgCost: 30 }],
      },
      riskProfile: { declaredTolerance: "MODERATE", constraints: [] },
    };
    const out = (await skillEngine.executeSkill("finance-tax-review", { input }, { taskId: "t", input: fullInput })) as ResearchOutput;
    expect(out.evidence[0].content).toContain("800.00"); // (38-30)*100
    expect(out.dataGaps).toHaveLength(0);
  });

  it("critic review objects to high confidence with data gaps", async () => {
    const { skillEngine } = setup();
    const draft = {
      taskType: "FINANCE_PORTFOLIO_ANALYSIS",
      dataSource: "MOCK_DEMO_DATA",
      portfolioSummary: { concentrationHHI: 0.4, holdings: [] },
      findings: [{ area: "RISK", severity: "HIGH", statement: "x", evidenceIds: ["EV-1"], assumptions: [], uncertainties: [] }],
      dataGaps: ["Sem preço para XPTO"],
      confidence: 0.9,
      criticObjections: [],
      openQuestions: [],
      disclaimers: [],
      scenarios: [],
      assumptions: [],
      hypotheticalActions: [],
    } as unknown as FinanceAnalysisReport;

    const { objections } = (await skillEngine.executeSkill(FINANCE_SKILLS.criticReview, { report: draft, input: fullInput }, { taskId: "t", input: fullInput })) as { objections: FinanceAnalysisReport["criticObjections"] };
    expect(objections.some(o => o.id === "C1" && o.objection.includes("confiança"))).toBe(true);
  });

  it("financial report consolidates everything and caps confidence with gaps", async () => {
    const { skillEngine } = setup();
    const research: ResearchOutput[] = [
      (await skillEngine.executeSkill(FINANCE_SKILLS.marketResearch, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput,
      (await skillEngine.executeSkill(FINANCE_SKILLS.macroSnapshot, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput,
      (await skillEngine.executeSkill(FINANCE_SKILLS.portfolioAnalysis, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput,
      (await skillEngine.executeSkill(FINANCE_SKILLS.riskAnalysis, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput,
      (await skillEngine.executeSkill(FINANCE_SKILLS.scenarioAnalysis, { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput,
      (await skillEngine.executeSkill("finance-tax-review", { input: fullInput }, { taskId: "t", input: fullInput })) as ResearchOutput,
    ];
    const report = (await skillEngine.executeSkill(
      FINANCE_SKILLS.financialReport,
      { input: fullInput, research, objections: [] },
      { taskId: "t", input: fullInput }
    )) as FinanceAnalysisReport;

    expect(report.taskType).toBe("FINANCE_PORTFOLIO_ANALYSIS");
    expect(report.dataSource).toBe("MOCK_DEMO_DATA");
    expect(report.dataGaps.some(g => g.includes("XPTO"))).toBe(true);
    expect(report.confidence).toBeLessThan(0.85);
    expect(report.scenarios.length).toBeGreaterThanOrEqual(3);
    expect(report.macroSnapshot.length).toBeGreaterThanOrEqual(3);
    expect(report.disclaimers.some(d => d.includes("NÃO é recomendação"))).toBe(true);
    expect(report.openQuestions.some(q => q.includes("cripto"))).toBe(true);
  });

  it("enforces skill preconditions (empty context fails)", async () => {
    const { skillEngine } = setup();
    await expect(
      skillEngine.executeSkill(FINANCE_SKILLS.portfolioAnalysis, { input: fullInput }, {})
    ).rejects.toThrow(/Preconditions failed/);
  });

  it("tools are reachable through the ToolEngine with validation", async () => {
    const { toolEngine } = setup();
    await expect(toolEngine.executeTool(FINANCE_TOOLS.marketData, {})).rejects.toThrow(/Validation failed/);
    const ok = await toolEngine.executeTool(FINANCE_TOOLS.economicData, {}) as { indicators: unknown[] };
    expect(ok.indicators.length).toBeGreaterThanOrEqual(3);
    expect(toolEngine.listTools().map(t => t.name)).toEqual(expect.arrayContaining(Object.values(FINANCE_TOOLS)));
  });
});
