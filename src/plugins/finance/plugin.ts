import { DariusPlugin, PluginContext } from "../contract.js";
import { ModelRouter } from "../../model/types.js";
import { createFinanceTools } from "./tools/index.js";
import { createFinanceSkills } from "./skills/index.js";
import {
  FinanceOrchestratorAgent,
  createFinanceAgents,
  FINANCE_AGENTS,
} from "./agents/finance-agents.js";
import { createFinanceVerifierFactories } from "./verification/verifiers.js";
import { FinanceAnalysisWorkflow } from "./workflow.js";
import { registerFinanceRoutes } from "./routes.js";

/**
 * DARIUS Finance — the plugin.
 *
 * Maps the vertical plugin contract onto the EXISTING Core engines:
 *   registerTools      → host ToolEngine (risk-gated, audited, READ-only)
 *   registerSkills     → host SkillEngine
 *   registerAgents     → host TaskEngine (observe/think/act agents)
 *   registerVerifiers  → host DeterministicVerificationEngine (CUSTOM rules)
 *   registerWorkflows  → FinanceAnalysisWorkflow over the host TaskEngine
 *   registerRoutes     → optional host HTTP registrar (framework-free)
 *
 * DARIUS Core never imports this file. Remove this plugin and DARIUS OS
 * keeps working unchanged.
 */

export interface FinancePluginOptions {
  /** Capability-based narrative hook (optional, no hardcoded provider). */
  modelRouter?: ModelRouter;
  reasoningCapability?: string;
  analysisTimeoutMs?: number;
  childTimeoutMs?: number;
}

export class FinancePlugin implements DariusPlugin {
  id = "finance";
  name = "DARIUS Finance";
  version = "0.1.0";
  description =
    "Financial Decision Operating Layer — vertical de análise de carteira com human-in-the-loop.";

  private workflow?: FinanceAnalysisWorkflow;

  constructor(private options: FinancePluginOptions = {}) {}

  async register(ctx: PluginContext): Promise<void> {
    // ---- Tools (also usable by any core agent via TOOL_CALL protocol) ----
    const bundle = createFinanceTools({ telemetry: ctx.telemetry });
    for (const tool of bundle.tools) {
      ctx.registerTool(tool);
    }

    // ---- Skills (procedures; call tools through the host ToolEngine) ----
    const skills = createFinanceSkills(ctx.toolEngine);
    for (const skill of skills) {
      ctx.registerSkill(skill);
    }

    // ---- Agents ----
    const agentDeps = {
      skillEngine: ctx.skillEngine,
      memory: ctx.memory,
      modelRouter: this.options.modelRouter,
      reasoningCapability: this.options.reasoningCapability,
    };
    for (const agent of createFinanceAgents(agentDeps)) {
      ctx.registerAgent(agent);
    }
    // Orchestrator: drives the workflow through the host TaskEngine itself.
    ctx.registerAgent(new FinanceOrchestratorAgent(agentDeps, ctx.taskEngine, this.options.childTimeoutMs));

    // ---- Verification gates (real Core verification hook) ----
    for (const { id, fn } of createFinanceVerifierFactories()) {
      ctx.registerCustomVerifier(id, fn);
    }

    // ---- Workflow + routes ----
    this.workflow = new FinanceAnalysisWorkflow({
      ...agentDeps,
      engine: ctx.taskEngine,
      telemetry: ctx.telemetry,
      modelRouter: this.options.modelRouter,
      analysisTimeoutMs: this.options.analysisTimeoutMs,
      childTimeoutMs: this.options.childTimeoutMs,
    });
    ctx.registerRoutes?.(registrar => registerFinanceRoutes(registrar, this.workflow as FinanceAnalysisWorkflow));
  }

  /** The workflow handle (available after register()). */
  getWorkflow(): FinanceAnalysisWorkflow {
    if (!this.workflow) {
      throw new Error("FinancePlugin.register() has not run yet — apply the plugin via PluginHost first");
    }
    return this.workflow;
  }

  /** Agent ids contributed by this vertical (useful for UI/tests). */
  static agentIds(): string[] {
    return [...Object.values(FINANCE_AGENTS)];
  }
}

/** Convenience factory. */
export function createFinancePlugin(options?: FinancePluginOptions): FinancePlugin {
  return new FinancePlugin(options);
}
