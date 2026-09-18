import { Tool } from "../../tools/types.js";
import { TelemetryEmitter } from "../../observability/types.js";
import { Severity } from "./types.js";

/**
 * DARIUS Finance — security policies.
 *
 * Principles enforced here (see DARIUS_FINANCE.md §Security):
 *  - least privilege: every Phase 1 finance tool is READ-only and LOW risk;
 *  - approval gates: hypothetical actions never execute; the workflow parks
 *    the task in WAITING_APPROVAL using the Core's native approval gate;
 *  - audit: every tool execution emits a TOOL_CALL telemetry event;
 *  - no credentials: providers are mock/local; no API keys anywhere;
 *  - model output is NEVER treated as authorization.
 */

/** Permission classification for finance tools. */
export type FinancePermission = "READ" | "WRITE" | "EXECUTE" | "SENSITIVE";

export interface FinanceToolSpec extends Omit<Tool, "execute" | "validate"> {
  permission: FinancePermission;
  timeoutMs: number;
  audit: boolean;
  execute: Tool["execute"];
  validate?: Tool["validate"];
}

/**
 * Phase 1 policy: finance tools are READ/LOW only.
 * Any tool that would be WRITE/EXECUTE/SENSITIVE (broker orders, money
 * movement) is FORBIDDEN from being registered in this phase and must go
 * through a human approval gate design in Phase 3.
 */
export function assertPhase1ToolPolicy(spec: FinanceToolSpec): void {
  const forbidden =
    spec.permission === "WRITE" ||
    spec.permission === "EXECUTE" ||
    spec.permission === "SENSITIVE" ||
    spec.risk === "HIGH" ||
    spec.risk === "CRITICAL";

  if (forbidden) {
    throw new Error(
      `Finance Phase 1 policy violation: tool '${spec.name}' declares permission '${spec.permission}' / risk '${spec.risk}'. ` +
      `Only READ + LOW/MEDIUM tools may be registered in Phase 1. Execution-class tools require the Phase 3 approval design.`
    );
  }
}

/**
 * Wrap a finance tool with timeout + audit telemetry.
 * The wrapper preserves the declared schema/risk so the existing
 * SimpleToolEngine keeps enforcing its own risk gate.
 */
export function auditedFinanceTool(spec: FinanceToolSpec, telemetry?: TelemetryEmitter): Tool {
  assertPhase1ToolPolicy(spec);

  return {
    name: spec.name,
    description: spec.description,
    risk: spec.risk,
    schema: spec.schema,
    validate: spec.validate,
    execute: async (params, context) => {
      const startedAt = Date.now();

      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Tool '${spec.name}' timed out after ${spec.timeoutMs}ms`));
        }, spec.timeoutMs);
        // Do not hold the process open because of a tool timer.
        if (typeof timer.unref === "function") timer.unref();
      });

      let status: "SUCCESS" | "FAILED" = "SUCCESS";
      try {
        const result = await Promise.race([spec.execute(params, context), timeout]);
        return result;
      } catch (error) {
        status = "FAILED";
        throw error;
      } finally {
        if (spec.audit && telemetry) {
          telemetry.emit({
            taskId: context?.taskId ?? "no-task",
            executionId: context?.executionId,
            eventType: "TOOL_CALL",
            payload: {
              tool: spec.name,
              permission: spec.permission,
              risk: spec.risk,
              status,
              durationMs: Date.now() - startedAt,
              // No chain-of-thought, no params dump: only what is needed for audit.
              paramKeys: Object.keys(params ?? {}),
            },
          });
        }
      }
    },
  };
}

/** Map a finance Severity to the tool-risk vocabulary of the Core. */
export function severityToToolRisk(severity: Severity): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  switch (severity) {
    case "CRITICAL": return "CRITICAL";
    case "HIGH": return "HIGH";
    case "MEDIUM": return "MEDIUM";
    default: return "LOW";
  }
}

/** Standard approval policy embedded in FINANCE_PORTFOLIO_ANALYSIS tasks. */
export const FINANCE_APPROVAL_POLICY = {
  required: true,
  gate: "WAITING_APPROVAL" as const,
  onReject: "CANCEL" as const,
};
