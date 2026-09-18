import { EngineObserver } from "../core/types.js";
import { TaskEngine } from "../core/engine.js";
import { ToolEngine } from "../tools/types.js";
import { SkillEngine } from "../skills/types.js";
import { MemoryStore } from "../memory/types.js";
import { TelemetryEmitter } from "../observability/types.js";
import { DeterministicVerificationEngine } from "../verification/engine.js";
import { DariusPlugin, PluginContext, RouteRegistrarLike } from "./contract.js";

export interface PluginHostConfig {
  taskEngine: TaskEngine;
  toolEngine: ToolEngine;
  skillEngine: SkillEngine;
  memory: MemoryStore;
  telemetry: TelemetryEmitter;
  /** If provided, plugins may register custom deterministic verifiers. */
  verifier?: DeterministicVerificationEngine;
  /** Optional HTTP route registrar adapted by the host server. */
  routes?: RouteRegistrarLike;
}

export interface RegisteredPluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
}

/**
 * PluginHost applies vertical plugins on top of an existing DARIUS OS runtime.
 *
 * It is deliberately NOT referenced by the Core: removing every plugin
 * (and this host) leaves DARIUS OS fully functional.
 */
export class PluginHost {
  private registered: DariusPlugin[] = [];

  constructor(private config: PluginHostConfig) {}

  listPlugins(): RegisteredPluginInfo[] {
    return this.registered.map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
    }));
  }

  hasPlugin(id: string): boolean {
    return this.registered.some(p => p.id === id);
  }

  async apply(plugin: DariusPlugin): Promise<void> {
    if (this.hasPlugin(plugin.id)) {
      throw new Error(`Plugin '${plugin.id}' is already applied`);
    }

    const ctx: PluginContext = {
      // Runtime handles (call access — never replacement).
      taskEngine: this.config.taskEngine,
      toolEngine: this.config.toolEngine,
      skillEngine: this.config.skillEngine,
      memory: this.config.memory,
      telemetry: this.config.telemetry,
      verifier: this.config.verifier,

      // Registration functions.
      registerAgent: (agent) => this.config.taskEngine.registerAgent(agent),
      registerTool: (tool) => this.config.toolEngine.register(tool),
      registerSkill: (skill) => this.config.skillEngine.registerSkill(skill),
      registerCustomVerifier: (id, verifier) => {
        if (!this.config.verifier) {
          throw new Error(
            `Plugin '${plugin.id}' cannot register custom verifier '${id}': no verification engine configured`
          );
        }
        this.config.verifier.registerCustomVerifier(id, verifier);
      },
      registerObserver: (observer: EngineObserver) => {
        this.config.taskEngine.subscribe(observer);
      },
      registerRoutes: this.config.routes
        ? (register: (registrar: RouteRegistrarLike) => void) => {
            register(this.config.routes as RouteRegistrarLike);
          }
        : undefined,
    };

    await plugin.register(ctx);
    this.registered.push(plugin);
    this.config.telemetry.emit({
      taskId: "plugin-host",
      eventType: "TASK_COMPLETED",
      payload: { event: "PLUGIN_APPLIED", pluginId: plugin.id, version: plugin.version },
    });
  }

  /** The registrar, if any, handed to plugins via registerRoutes(). */
  getRouteRegistrar(): RouteRegistrarLike | undefined {
    return this.config.routes;
  }
}
