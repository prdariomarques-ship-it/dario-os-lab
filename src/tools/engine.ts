import { Tool, ToolEngine, ToolEngineConfig, ToolDefinition } from "./types.js";

export class SimpleToolEngine implements ToolEngine {
  private tools: Map<string, Tool> = new Map();

  constructor(private config: ToolEngineConfig = { allowHighRisk: false, allowCriticalRisk: false }) {}

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      risk: t.risk,
      schema: t.schema
    }));
  }

  async executeTool(name: string, params: Record<string, unknown>, context?: { taskId?: string; executionId?: string }): Promise<string | Record<string, unknown>> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    if (tool.risk === "HIGH" && !this.config.allowHighRisk) {
      throw new Error(`Execution of HIGH risk tool '${name}' is not allowed by current policy`);
    }

    if (tool.risk === "CRITICAL" && !this.config.allowCriticalRisk) {
      throw new Error(`Execution of CRITICAL risk tool '${name}' is not allowed by current policy`);
    }

    if (tool.validate && !tool.validate(params)) {
      throw new Error(`Validation failed for tool '${name}' with params ${JSON.stringify(params)}`);
    }

    // RC2 hardening (B6): a declared positive timeoutMs is enforced as a REAL
    // per-tool wall-clock budget. Without it, a tool whose promise never
    // settles (hung socket, forgotten await, deadlock) would wedge the agent
    // loop forever — the task-level budget eventually fails the task, but the
    // in-flight execution can never be reclaimed. Invalid values (0, negative,
    // NaN, non-number) keep the legacy behavior: no per-tool timeout.
    const timeoutMs = (tool as { timeoutMs?: number }).timeoutMs;
    const hasTimeout =
      typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0;

    try {
      if (!hasTimeout) {
        return await tool.execute(params, context);
      }

      // The losing promise is explicitly muted: when the timer wins, the tool
      // promise may still reject much later — that late rejection must never
      // surface as an unhandled rejection (and its late value is irrelevant).
      const execution = Promise.resolve(tool.execute(params, context));
      execution.catch(() => {});

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Tool '${name}' timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
          // A pending tool timer must never, by itself, keep the process alive.
          (timer as { unref?: () => void }).unref?.();
        });
        return await Promise.race([execution, timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (error) {
      throw new Error(`Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
