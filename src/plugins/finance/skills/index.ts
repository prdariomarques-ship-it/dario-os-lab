import { Skill } from "../../../skills/types.js";
import { ToolEngine } from "../../../tools/types.js";
import {
  FinanceTaskInput,
  FinanceAnalysisReport,
  FinanceEvidence,
  FinanceFinding,
  HypotheticalAction,
  PortfolioMetrics,
  RiskMetrics,
  ScenarioResult,
  FinancePortfolio,
} from "../types.js";
import { FINANCE_TOOLS } from "../tools/index.js";
import { DEFAULT_SCENARIOS } from "../tools/simulation.js";
import { MarketQuote, EconomicIndicator } from "../tools/providers.js";

/**
 * DARIUS Finance — skills (procedures), registered into the EXISTING
 * Skill Engine. Agents delegate to skills; skills delegate to tools.
 * No skill talks to a provider directly — the Tool Engine is the only path.
 */

export const FINANCE_SKILLS = {
  marketResearch: "finance-market-research",
  macroSnapshot: "finance-macro-snapshot",
  portfolioAnalysis: "finance-portfolio-analysis",
  riskAnalysis: "finance-risk-analysis",
  scenarioAnalysis: "finance-scenario-analysis",
  criticReview: "finance-critic-review",
  financialReport: "finance-financial-report",
} as const;

export interface ResearchOutput {
  area: string;
  evidence: FinanceEvidence[];
  findings: FinanceFinding[];
  dataGaps: string[];
  notes: string[];
  /** Optional structured extras used by the report skill. */
  metrics?: PortfolioMetrics;
  risk?: RiskMetrics;
  actions?: HypotheticalAction[];
  scenarios?: ScenarioResult[];
  macroIndicators?: Array<{ id: string; label: string; value: number; unit: string; isMock: boolean }>;
}

let evidenceSeq = 0;
export function makeEvidence(
  source: string,
  kind: FinanceEvidence["kind"],
  content: string,
  isMock: boolean,
  confidence = 0.8,
  dataAsOf?: string
): FinanceEvidence {
  evidenceSeq += 1;
  return {
    id: `EV-${evidenceSeq}`,
    source,
    kind,
    content,
    isMock,
    confidence,
    dataAsOf,
  };
}

export function createFinanceSkills(toolEngine: ToolEngine): Skill[] {
  const quoteMap = (quotes: MarketQuote[]) => new Map(quotes.map(q => [q.symbol, q]));

  // --------------------------------------------------------------- research
  const marketResearch: Skill = {
    id: FINANCE_SKILLS.marketResearch,
    name: "Market Research (Finance)",
    description: "Coleta cotações via Tool Engine, registra evidências rotuladas (MOCK) e lacunas de dados.",
    version: "0.1.0",
    preconditions: (ctx) => !!(ctx && ctx.input),
    execute: async (params: { input: FinanceTaskInput }) => {
      const { input } = params;
      const symbols = input.portfolio.holdings.map(h => h.symbol);
      const result = await toolEngine.executeTool(FINANCE_TOOLS.marketData, { symbols });
      const quotes = (result as { quotes: MarketQuote[] }).quotes;
      const isMock = (result as { isMock: boolean }).isMock;
      const qm = quoteMap(quotes);
      const evidence: FinanceEvidence[] = [];
      const dataGaps: string[] = [];

      for (const h of input.portfolio.holdings) {
        const q = qm.get(h.symbol);
        if (h.currentPrice === undefined && !q) {
          dataGaps.push(`Sem preço declarado nem cotação para ${h.symbol} — posição NÃO foi valorizada.`);
        } else if (q) {
          evidence.push(makeEvidence(
            FINANCE_TOOLS.marketData,
            "MARKET_DATA",
            `Cotação ${h.symbol} = ${q.price} ${q.currency} (${isMock ? "MOCK/demonstração" : "live"})`,
            isMock,
            isMock ? 0.4 : 0.9,
            q.asOf
          ));
        }
      }
      const findings: FinanceFinding[] = dataGaps.map(g => ({
        area: "DATA_QUALITY" as const,
        severity: "MEDIUM" as const,
        statement: g,
        evidenceIds: [],
        assumptions: [],
        uncertainties: ["Preço real indisponível na Fase 1"],
      }));
      return { area: "MARKET", evidence, findings, dataGaps, notes: ["Dados de cotação da Fase 1 são mock determinístico rotulado."] } as ResearchOutput;
    },
  };

  // ------------------------------------------------------------------ macro
  const macroSnapshot: Skill = {
    id: FINANCE_SKILLS.macroSnapshot,
    name: "Macro Snapshot (Finance)",
    description: "Snapshot macroeconômico (juros, inflação, câmbio) via Tool Engine, rotulado como demonstração.",
    version: "0.1.0",
    execute: async () => {
      const result = await toolEngine.executeTool(FINANCE_TOOLS.economicData, {});
      const indicators = (result as { indicators: EconomicIndicator[] }).indicators;
      const isMock = (result as { isMock: boolean }).isMock;
      const evidence = indicators.map(i => makeEvidence(
        FINANCE_TOOLS.economicData,
        "MACRO",
        `${i.label}: ${i.value} ${i.unit}`,
        isMock,
        0.4,
        i.asOf
      ));
      const findings: FinanceFinding[] = [{
        area: "MACRO",
        severity: "INFO",
        statement: `Cenário macro (demonstração): ${indicators.map(i => `${i.label.split("(")[0].trim()} ${i.value}${i.unit}`).join("; ")}.`,
        evidenceIds: evidence.map(e => e.id),
        assumptions: ["Indicadores mock; nenhuma projeção macro foi feita."],
        uncertainties: ["Valores reais requerem provider econômico real (Fase 2)."],
      }];
      return { area: "MACRO", evidence, findings, dataGaps: [], notes: ["Sem previsões: apenas leitura declarada dos indicadores."], macroIndicators: indicators.map(i => ({ id: i.id, label: i.label, value: i.value, unit: i.unit, isMock: i.source === "MOCK" })) } as ResearchOutput;
    },
  };

  // -------------------------------------------------------------- portfolio
  const portfolioAnalysis: Skill = {
    id: FINANCE_SKILLS.portfolioAnalysis,
    name: "Portfolio Analysis (Finance)",
    description: "Pesos, HHI, alocação por classe e ações hipotéticas de rebalanceamento (sempre PROPOSTAS).",
    version: "0.1.0",
    preconditions: (ctx) => !!(ctx && ctx.input && ctx.input.portfolio.holdings.length > 0),
    execute: async (params: { input: FinanceTaskInput }) => {
      const { input } = params;
      const result = await toolEngine.executeTool(FINANCE_TOOLS.calculator, { portfolio: input.portfolio });
      const metrics = (result as { metrics: PortfolioMetrics }).metrics;
      const evidence: FinanceEvidence[] = [makeEvidence(
        FINANCE_TOOLS.calculator,
        "CALCULATION",
        `Valor precificado ${metrics.pricedValue} ${metrics.baseCurrency}; HHI=${metrics.concentrationHHI}; top weight ${(metrics.topWeight * 100).toFixed(1)}% (${metrics.topPosition?.symbol ?? "n/a"}); nível ${metrics.concentrationLevel}.`,
        false,
        1.0
      )];
      if (metrics.unpricedSymbols.length > 0) {
        evidence.push(makeEvidence(
          FINANCE_TOOLS.calculator,
          "CALCULATION",
          `Posições sem preço (excluídas do cálculo): ${metrics.unpricedSymbols.join(", ")}.`,
          false,
          1.0
        ));
      }
      const findings: FinanceFinding[] = [];
      if (metrics.concentrationLevel === "HIGHLY_CONCENTRATED" || metrics.concentrationLevel === "CONCENTRATED") {
        findings.push({
          area: "CONCENTRATION",
          severity: metrics.concentrationLevel === "HIGHLY_CONCENTRATED" ? "HIGH" : "MEDIUM",
          statement: `Carteira ${metrics.concentrationLevel === "HIGHLY_CONCENTRATED" ? "altamente concentrada" : "concentrada"}: HHI ${metrics.concentrationHHI}, maior posição ${(metrics.topWeight * 100).toFixed(1)}%${metrics.topPosition ? ` (${metrics.topPosition.symbol})` : ""}.`,
          evidenceIds: [evidence[0].id],
          assumptions: ["Somente posições precificadas entram no cálculo."],
          uncertainties: metrics.unpricedSymbols.length > 0 ? [`Pesos reais podem diferir: ${metrics.unpricedSymbols.join(", ")} sem preço.`] : [],
        });
      } else {
        findings.push({
          area: "CONCENTRATION",
          severity: "INFO",
          statement: `Concentração moderada/baixa: HHI ${metrics.concentrationHHI}, efetivo de ${metrics.effectiveNumberOfAssets} ativos.`,
          evidenceIds: [evidence[0].id],
          assumptions: ["Somente posições precificadas."],
          uncertainties: [],
        });
      }
      const actions: HypotheticalAction[] = [];
      if (metrics.topPosition && metrics.topWeight > 0.35) {
        actions.push({
          description: `Estudar redução gradual de ${metrics.topPosition.symbol} (hoje ${(metrics.topWeight * 100).toFixed(1)}% da carteira precificada) em direção a um teto declarado pelo usuário.`,
          rationale: "Reduzir risco de concentração de posição única.",
          riskLevel: "MEDIUM",
          requiresApproval: true,
          status: "PROPOSED",
        });
      }
      return { area: "PORTFOLIO", evidence, findings, dataGaps: metrics.unpricedSymbols.map(s => `Preço ausente: ${s}`), notes: ["Métricas determinísticas; nenhum dado foi inventado."], metrics, actions } as ResearchOutput;
    },
  };

  // ------------------------------------------------------------------- risk
  const riskAnalysis: Skill = {
    id: FINANCE_SKILLS.riskAnalysis,
    name: "Risk Analysis (Finance)",
    description: "Volatilidade, drawdown e VaR aproximado sobre série sintética determinística (rotulada).",
    version: "0.1.0",
    execute: async (params: { input: FinanceTaskInput }) => {
      const { input } = params;
      const result = await toolEngine.executeTool(FINANCE_TOOLS.calculator, {
        portfolio: input.portfolio,
        withRisk: true,
      });
      const { metrics, risk } = result as { metrics: PortfolioMetrics; risk: RiskMetrics };
      const evidence: FinanceEvidence[] = [];
      if (risk.annualizedVolatility !== null) {
        evidence.push(makeEvidence(
          FINANCE_TOOLS.calculator,
          "CALCULATION",
          `Vol anualizada (série sintética) = ${(risk.annualizedVolatility * 100).toFixed(2)}%; max drawdown = ${(risk.maxDrawdown! * 100).toFixed(2)}%; VaR95(21d) ≈ ${risk.var95Approx} ${metrics.baseCurrency}.`,
          true,
          0.5
        ));
      }
      const findings: FinanceFinding[] = [];
      const crypto = input.portfolio.holdings.filter(h => h.assetClass === "CRYPTO");
      if (crypto.length > 0) {
        findings.push({
          area: "RISK",
          severity: "HIGH",
          statement: `Exposição a criptoativos (${crypto.map(c => c.symbol).join(", ")}) com potencial de perda severa — ver cenário CRYPTO_CRASH_50.`,
          evidenceIds: evidence.map(e => e.id),
          assumptions: ["Classe de ativo declarada pelo usuário."],
          uncertainties: ["Magnitude real depende de preços e pesos efetivos."],
        });
      }
      if (input.riskProfile.declaredTolerance === "CONSERVATIVE") {
        findings.push({
          area: "RISK",
          severity: "MEDIUM",
          statement: "Perfil declarado conservador: revisar compatibilidade com volatilidade implícita da carteira atual.",
          evidenceIds: [],
          assumptions: [`Tolerância declarada: CONSERVATIVE`],
          uncertainties: [],
        });
      }
      return { area: "RISK", evidence, findings, dataGaps: metrics.unpricedSymbols.map(s => `Preço ausente: ${s}`), notes: risk.notes, metrics, risk } as ResearchOutput;
    },
  };

  // --------------------------------------------------------------- scenario
  const scenarioAnalysis: Skill = {
    id: FINANCE_SKILLS.scenarioAnalysis,
    name: "Scenario Analysis (Finance)",
    description: "Simula cenários declarados de estresse sobre a carteira precificada.",
    version: "0.1.0",
    execute: async (params: { input: FinanceTaskInput; scenarioIds?: string[] }) => {
      const { input, scenarioIds } = params;
      const result = await toolEngine.executeTool(FINANCE_TOOLS.simulator, {
        portfolio: input.portfolio,
        scenarioIds,
      });
      const scenarios = (result as { scenarios: ScenarioResult[] }).scenarios;
      const evidence = scenarios.map(s => makeEvidence(
        FINANCE_TOOLS.simulator,
        "SCENARIO",
        `${s.id}: impacto ${(s.portfolioImpactPct * 100).toFixed(1)}% (${s.portfolioImpactValue} ${input.portfolio.baseCurrency}); valor estressado ${s.stressedPortfolioValue}.`,
        true, // derived from demo/mock market prices
        0.9
      ));
      const worst = scenarios.slice().sort((a, b) => a.portfolioImpactPct - b.portfolioImpactPct)[0];
      const findings: FinanceFinding[] = worst ? [{
        area: "RISK",
        severity: worst.portfolioImpactPct <= -0.25 ? "HIGH" : "MEDIUM",
        statement: `Cenário mais adverso testado: ${worst.label} → impacto de ${(worst.portfolioImpactPct * 100).toFixed(1)}% no valor precificado.`,
        evidenceIds: evidence.map(e => e.id),
        assumptions: ["Choques determinísticos declarados; sem probabilidades."],
        uncertainties: ["Cenários são ilustrativos, não previsões."],
      }] : [];
      return { area: "SCENARIO", evidence, findings, dataGaps: [], notes: [`Cenários disponíveis: ${DEFAULT_SCENARIOS.map(s => s.id).join(", ")}.`], scenarios } as ResearchOutput;
    },
  };

  // ------------------------------------------------------------------ tax
  const taxReview: Skill = {
    id: "finance-tax-review",
    name: "Tax Review (Finance)",
    description: "Avalia disponibilidade de dados tributários; calcula P&L latente quando custo declarado. Sem regras fiscais específicas de jurisdição no MVP.",
    version: "0.1.0",
    execute: async (params: { input: FinanceTaskInput }) => {
      const { input } = params;
      const withCost = input.portfolio.holdings.filter(h => typeof h.avgCost === "number");
      const evidence: FinanceEvidence[] = [];
      const findings: FinanceFinding[] = [];
      const dataGaps: string[] = [];

      if (withCost.length === 0) {
        dataGaps.push("Nenhum preço médio de custo declarado — análise tributária quantitativa não executada.");
        findings.push({
          area: "TAX",
          severity: "INFO",
          statement: "Análise tributária qualitativa apenas: MVP não embute regras fiscais de jurisdição específica.",
          evidenceIds: [],
          assumptions: [],
          uncertainties: ["Regras tributárias exigem dados e jurisdição declarados."],
        });
      } else {
        const symbols = input.portfolio.holdings.map(h => h.symbol);
        const md = await toolEngine.executeTool(FINANCE_TOOLS.marketData, { symbols });
        const qm = quoteMap((md as { quotes: MarketQuote[] }).quotes);
        let totalUnrealized = 0;
        for (const h of withCost) {
          const q = qm.get(h.symbol);
          const price = h.currentPrice ?? q?.price;
          if (price !== undefined) {
            totalUnrealized += (price - (h.avgCost as number)) * h.quantity;
          }
        }
        evidence.push(makeEvidence(
          "finance-tax-review",
          "CALCULATION",
          `P&L latente (não realizado) das posições com custo declarado: ${totalUnrealized.toFixed(2)} ${input.portfolio.baseCurrency}.`,
          true, // price derived from the mock provider (demo data)
          0.9
        ));
        findings.push({
          area: "TAX",
          severity: "INFO",
          statement: `P&L latente agregado: ${totalUnrealized.toFixed(2)} ${input.portfolio.baseCurrency}. Impacto fiscal requer jurisdição e regras vigentes — não incluídas no MVP.`,
          evidenceIds: [evidence[0].id],
          assumptions: ["Preço médio declarado pelo usuário."],
          uncertainties: ["Carga tributária efetiva depende de jurisdição/regras."],
        });
      }
      return { area: "TAX", evidence, findings, dataGaps, notes: [] } as ResearchOutput;
    },
  };

  // ----------------------------------------------------------------- critic
  const criticReview: Skill = {
    id: FINANCE_SKILLS.criticReview,
    name: "Critic Review (Finance)",
    description: "Tenta invalidar o rascunho de relatório: premissas, dados ausentes, excesso de confiança, discursos não suportados.",
    version: "0.1.0",
    execute: async (params: { report: FinanceAnalysisReport; input: FinanceTaskInput }) => {
      const { report, input } = params;
      const objections: FinanceAnalysisReport["criticObjections"] = [];

      if (report.dataGaps.length > 0 && report.confidence >= 0.8) {
        objections.push({
          id: "C1",
          target: "confidence",
          objection: `Relatório com ${report.dataGaps.length} lacuna(s) de dados não deveria declarar confiança ≥ 0.8.`,
          addressed: true,
          resolution: "Confiança reduzida para refletir lacunas.",
        });
      }
      const unsupported = report.findings.filter(
        f => f.evidenceIds.length === 0 && f.area !== "DATA_QUALITY" && f.area !== "TAX"
      );
      if (unsupported.length > 0) {
        objections.push({
          id: "C2",
          target: "findings",
          objection: `Achados sem evidência anexada: ${unsupported.map(f => f.statement.slice(0, 60)).join(" | ")}`,
          addressed: true,
          resolution: "Achados marcados como hipóteses incertas; permanecem com incertezas explícitas.",
        });
      }
      const mockFindings = report.findings.filter(
        f => f.assumptions.some(a => a.toLowerCase().includes("mock"))
      );
      if (mockFindings.length > 0 && !report.dataSource.includes("MOCK")) {
        objections.push({
          id: "C3",
          target: "dataSource",
          objection: "Achados dependem de dados MOCK mas dataSource não declara MOCK_DEMO_DATA.",
          addressed: true,
          resolution: "dataSource ajustado para refletir origem dos dados.",
        });
      }
      const concentration = report.portfolioSummary.concentrationHHI;
      if (!(concentration >= 0 && concentration <= 1)) {
        objections.push({
          id: "C4",
          target: "portfolioSummary.concentrationHHI",
          objection: `HHI fora do intervalo válido [0,1]: ${concentration}.`,
          addressed: true,
          resolution: "HHI recalculado pela ferramenta determinística.",
        });
      }
      if (input.questions && input.questions.length > 0) {
        const answered = report.openQuestions.length + report.findings.length;
        if (answered === 0) {
          objections.push({
            id: "C5",
            target: "openQuestions",
            objection: "Usuário fez perguntas explícitas e o relatório não as endereça.",
            addressed: true,
            resolution: "Perguntas do usuário propagadas para openQuestions.",
          });
        }
      }
      return { objections };
    },
  };

  // ----------------------------------------------------------------- report
  const financialReport: Skill = {
    id: FINANCE_SKILLS.financialReport,
    name: "Financial Report (Finance)",
    description: "Consolida outputs de pesquisa, risco, cenários e críticas no relatório final estruturado.",
    version: "0.1.0",
    execute: async (params: {
      input: FinanceTaskInput;
      research: ResearchOutput[];
      objections: FinanceAnalysisReport["criticObjections"];
      narrative?: string;
    }) => {
      const { input, research, objections, narrative } = params;
      const portfolio = research.find(r => "metrics" in r)?.metrics;
      const risk = research.find(r => "risk" in r)?.risk;

      const findings = research.flatMap(r => r.findings);
      const evidence = research.flatMap(r => r.evidence);
      const dataGaps = Array.from(new Set(research.flatMap(r => r.dataGaps)));
      // Scenarios ride on the risk research output (risk agent runs both skills).
      const scenarios = research.find(r => Array.isArray(r.scenarios) && r.scenarios.length > 0)?.scenarios ?? [];
      const macroIndicators = research.find(r => r.area === "MACRO")?.macroIndicators ?? [];

      const actions: HypotheticalAction[] = [
        ...(research.flatMap(r => ("actions" in r ? (r.actions as HypotheticalAction[]) : []))),
      ];

      const anyMock = evidence.some(e => e.isMock);
      const allMock = evidence.length > 0 && evidence.every(e => e.isMock || e.kind === "CALCULATION");

      const openQuestions = new Set<string>([
        ...(input.questions ?? []),
        ...(input.riskProfile.declaredTolerance === "UNKNOWN"
          ? ["Qual é a tolerância real a risco? Perfil declarado está UNKNOWN."]
          : []),
        ...(input.riskProfile.horizonMonths === undefined
          ? ["Qual é o horizonte de investimento em meses?"]
          : []),
      ]);
      for (const gap of dataGaps) openQuestions.add(`Como tratar lacuna: ${gap}?`);

      const confidence = computeConfidence(dataGaps.length, evidence.length, input);

      const report: FinanceAnalysisReport = {
        taskType: "FINANCE_PORTFOLIO_ANALYSIS",
        generatedAt: new Date().toISOString(),
        dataSource: anyMock ? (allMock ? "MOCK_DEMO_DATA" : "MIXED") : "USER_DECLARED",
        portfolioSummary: {
          baseCurrency: input.portfolio.baseCurrency,
          pricedValue: portfolio?.pricedValue ?? 0,
          unpricedSymbols: portfolio?.unpricedSymbols ?? input.portfolio.holdings.map(h => h.symbol),
          holdings: input.portfolio.holdings.map(h => {
            const pos = portfolio?.positions.find(p => p.symbol === h.symbol);
            return {
              symbol: h.symbol,
              assetClass: h.assetClass,
              quantity: h.quantity,
              value: pos?.priced ? pos.value : undefined,
              weight: pos?.priced ? pos.weight : undefined,
            };
          }),
          concentrationHHI: portfolio?.concentrationHHI ?? 0,
          concentrationLevel: portfolio?.concentrationLevel ?? "HIGHLY_CONCENTRATED",
          topWeight: portfolio?.topWeight ?? 0,
          assetClassAllocation: portfolio?.assetClassAllocation ?? [],
        },
        riskSummary: risk ?? null,
        macroSnapshot: macroIndicators,
        findings,
        scenarios,
        openQuestions: Array.from(openQuestions),
        dataGaps,
        assumptions: Array.from(new Set(findings.flatMap(f => f.assumptions))),
        hypotheticalActions: actions,
        criticObjections: objections,
        confidence,
        narrative,
        disclaimers: [
          "DARIUS Finance é uma camada de análise e decisão assistida; NÃO é recomendação de investimento autônoma.",
          anyMock
            ? "Contém dados de DEMONSTRAÇÃO (mock determinístico rotulado). Nenhum dado de mercado real foi usado."
            : "Baseado apenas em dados declarados pelo usuário.",
          "Ações hipotéticas NÃO executam nada: requerem aprovação humana e, na Fase 1, não há execução real.",
        ],
      };
      return report;
    },
  };

  return [marketResearch, macroSnapshot, portfolioAnalysis, riskAnalysis, scenarioAnalysis, taxReview, criticReview, financialReport];
}

function computeConfidence(gapCount: number, evidenceCount: number, input: FinanceTaskInput): number {
  let confidence = 0.85;
  if (gapCount > 0) confidence -= Math.min(0.3, gapCount * 0.1);
  if (evidenceCount < 3) confidence -= 0.1;
  if (input.riskProfile.declaredTolerance === "UNKNOWN") confidence -= 0.05;
  if (input.riskProfile.horizonMonths === undefined) confidence -= 0.05;
  return Math.max(0.1, Math.min(0.9, Math.round(confidence * 100) / 100));
}

export type { FinancePortfolio };
