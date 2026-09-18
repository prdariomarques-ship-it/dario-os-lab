import { Agent, EngineObserver } from "../core/types.js";
import { Tool, ToolEngine } from "../tools/types.js";
import { Skill, SkillEngine } from "../skills/types.js";
import { MemoryStore } from "../memory/types.js";
import { TelemetryEmitter } from "../observability/types.js";
import { TaskEngine } from "../core/engine.js";
import { DeterministicVerificationEngine } from "../verification/engine.js";
import { VerificationResult } from "../verification/types.js";
import type { Task as CoreTask } from "../core/types.js";

/**
 * DARIUS Vertical Plugin Contract (minimal).
 *
 * This contract belongs to the plugins layer, NOT to the Core.
 * DARIUS Core never imports this file. A vertical plugin imports it
 * and receives a PluginContext that wraps already-existing Core engines.
 *
 * Architectural rule:
 *   DARIUS does not depend on plugins. Plugins depend on DARIUS.
 *   If every plugin is removed, DARIUS OS keeps working unchanged.
 */

/**
 * Minimal HTTP-ish route surface so plugins can expose API routes
 * without depending on any specific HTTP framework (express is NOT a
 * dependency of this repository). A host server adapts its own app
 * object to this structural interface.
 */
export interface RouteRegistrarLike {
  get(path: string, handler: (req: unknown, res: unknown) => void): void;
  post(path: string, handler: (req: unknown, res: unknown) => void): void;
}

export interface PluginContext {
  /**
   * Runtime handles to the EXISTING Core engines (call access).
   * Plugins may invoke these engines but must never replace or wrap them.
   */
  taskEngine: TaskEngine;
  toolEngine: ToolEngine;
  skillEngine: SkillEngine;
  memory: MemoryStore;
  telemetry: TelemetryEmitter;
  /** Present when the host runs a DeterministicVerificationEngine. */
  verifier?: DeterministicVerificationEngine;

  /** Register an agent into the existing Task Engine. */
  registerAgent(agent: Agent): void;

  /** Register a tool into the existing Tool Engine (risk-gated). */
  registerTool(tool: Tool): void;

  /** Register a skill into the existing Skill Engine. */
  registerSkill(skill: Skill): void;

  /**
   * Register a deterministic custom verifier into the existing
   * Verification Engine (DeterministicVerificationEngine.registerCustomVerifier).
   */
  registerCustomVerifier(
    id: string,
    verifier: (task: CoreTask, result: string) => Promise<VerificationResult>
  ): void;

  /** Subscribe an extra observer to engine events (audit, UI, etc). */
  registerObserver(observer: EngineObserver): void;

  /**
   * Expose HTTP routes through the host's registrar (optional).
   * Usage: ctx.registerRoutes?.(r => r.get("/api/finance/health", handler));
   */
  registerRoutes?(register: (registrar: RouteRegistrarLike) => void): void;
}

export interface DariusPlugin {
  /** Unique plugin id, e.g. "finance". */
  id: string;
  name: string;
  version: string;
  description?: string;
  register(ctx: PluginContext): void | Promise<void>;
}

export type { CoreTask, VerificationResult };
