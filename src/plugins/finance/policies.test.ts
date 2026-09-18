import { describe, it, expect } from "vitest";
import { SimpleTelemetryEmitter } from "../../observability/engine.js";
import { assertPhase1ToolPolicy, auditedFinanceTool, FinanceToolSpec } from "./policies.js";
import { TelemetryEvent } from "../../observability/types.js";

function spec(overrides: Partial<FinanceToolSpec> = {}): FinanceToolSpec {
  return {
    name: "finance_test_tool",
    description: "test",
    risk: "LOW",
    permission: "READ",
    timeoutMs: 500,
    audit: false,
    schema: { type: "object" },
    execute: async () => "ok",
    ...overrides,
  };
}

describe("Phase 1 tool policy", () => {
  it("rejects WRITE/EXECUTE/SENSITIVE permissions", () => {
    expect(() => assertPhase1ToolPolicy(spec({ permission: "WRITE" }))).toThrow(/Phase 1 policy violation/);
    expect(() => assertPhase1ToolPolicy(spec({ permission: "EXECUTE" }))).toThrow(/Phase 1 policy violation/);
    expect(() => assertPhase1ToolPolicy(spec({ permission: "SENSITIVE" }))).toThrow(/Phase 1 policy violation/);
  });

  it("rejects HIGH/CRITICAL risk", () => {
    expect(() => assertPhase1ToolPolicy(spec({ risk: "HIGH" }))).toThrow(/Phase 1 policy violation/);
    expect(() => assertPhase1ToolPolicy(spec({ risk: "CRITICAL" }))).toThrow(/Phase 1 policy violation/);
  });

  it("accepts READ/LOW and READ/MEDIUM", () => {
    expect(() => assertPhase1ToolPolicy(spec())).not.toThrow();
    expect(() => assertPhase1ToolPolicy(spec({ risk: "MEDIUM" }))).not.toThrow();
  });
});

describe("auditedFinanceTool wrapper", () => {
  it("passes through successful execution", async () => {
    const tool = auditedFinanceTool(spec());
    await expect(tool.execute({ a: 1 })).resolves.toBe("ok");
  });

  it("enforces the declared timeout", async () => {
    const tool = auditedFinanceTool(spec({
      timeoutMs: 25,
      execute: async () => new Promise(resolve => setTimeout(resolve, 5000)),
    }));
    await expect(tool.execute({})).rejects.toThrow(/timed out after 25ms/);
  });

  it("emits TOOL_CALL audit telemetry with tool identity (no params dump)", async () => {
    const emitter = new SimpleTelemetryEmitter();
    const events: TelemetryEvent[] = [];
    emitter.subscribe(e => events.push(e));

    const tool = auditedFinanceTool(spec({ audit: true, permission: "READ", risk: "LOW" }), emitter);
    await tool.execute({ secretField: "should-not-appear" }, { taskId: "t-1", executionId: "e-1" });

    const audit = events.find(e => e.eventType === "TOOL_CALL");
    expect(audit).toBeDefined();
    expect(audit!.taskId).toBe("t-1");
    expect(audit!.payload.tool).toBe("finance_test_tool");
    expect(audit!.payload.permission).toBe("READ");
    expect(audit!.payload.status).toBe("SUCCESS");
    expect(JSON.stringify(audit!.payload)).not.toContain("should-not-appear");
  });

  it("audits FAILED executions", async () => {
    const emitter = new SimpleTelemetryEmitter();
    const events: TelemetryEvent[] = [];
    emitter.subscribe(e => events.push(e));

    const tool = auditedFinanceTool(spec({
      audit: true,
      execute: async () => { throw new Error("boom"); },
    }), emitter);

    await expect(tool.execute({})).rejects.toThrow("boom");
    const audit = events.find(e => e.eventType === "TOOL_CALL");
    expect(audit!.payload.status).toBe("FAILED");
  });

  it("keeps declared risk/schema so SimpleToolEngine keeps gating", async () => {
    const tool = auditedFinanceTool(spec({ risk: "MEDIUM" }));
    expect(tool.risk).toBe("MEDIUM");
    expect(tool.schema).toEqual({ type: "object" });
  });
});
