export type ToolRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ToolDefinition {
  name: string;
  description: string;
  risk: ToolRisk;
  schema: Record<string, any>; // JSON Schema format simplified
}

export interface Tool extends ToolDefinition {
  execute(params: Record<string, unknown>, context?: { taskId?: string; executionId?: string }): Promise<string | Record<string, unknown>>;
  validate?(params: Record<string, unknown>): boolean;
  /**
   * Optional wall-clock budget for THIS tool, in milliseconds.
   *
   * RC2 hardening (B6): a tool whose promise never settles must not be able
   * to wedge the agent loop forever. When timeoutMs is a positive finite
   * number, the engine races the execution against a real timer (unref'd so
   * the timer alone never keeps the process alive) and rejects with a
   * `timed out` error. Invalid values (0, negative, NaN, non-number) fall
   * back to the legacy behavior: no per-tool timeout.
   */
  timeoutMs?: number;
}

export interface ToolEngineConfig {
  allowHighRisk?: boolean;
  allowCriticalRisk?: boolean;
}

export interface ToolEngine {
  register(tool: Tool): void;
  getTool(name: string): Tool | undefined;
  executeTool(name: string, params: Record<string, unknown>, context?: { taskId?: string; executionId?: string }): Promise<string | Record<string, unknown>>;
  listTools?(): ToolDefinition[];
}
