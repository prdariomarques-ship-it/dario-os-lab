import { describe, expect, it, beforeEach } from "vitest";
import { SimpleToolEngine } from "./engine.js";
import { Tool } from "./types.js";

describe("SimpleToolEngine", () => {
  let engine: SimpleToolEngine;

  const lowRiskTool: Tool = {
    name: "calculator",
    description: "Adds two numbers",
    risk: "LOW",
    schema: { a: "number", b: "number" },
    execute: async (params) => {
      const { a, b } = params as { a: number; b: number };
      return String(a + b);
    },
    validate: (params) => typeof params.a === "number" && typeof params.b === "number"
  };

  const highRiskTool: Tool = {
    name: "rm",
    description: "Deletes a file",
    risk: "HIGH",
    schema: { path: "string" },
    execute: async (params) => `Deleted ${params.path}`
  };

  beforeEach(() => {
    engine = new SimpleToolEngine();
    engine.register(lowRiskTool);
    engine.register(highRiskTool);
  });

  it("should register and get a tool", () => {
    const tool = engine.getTool("calculator");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("calculator");
  });

  it("should prevent duplicate registration", () => {
    expect(() => engine.register(lowRiskTool)).toThrowError(/already registered/);
  });

  it("should execute a valid low risk tool", async () => {
    const result = await engine.executeTool("calculator", { a: 2, b: 3 });
    expect(result).toBe("5");
  });

  it("should block execution of invalid params via validation", async () => {
    await expect(engine.executeTool("calculator", { a: "2", b: 3 }))
      .rejects.toThrowError(/Validation failed/);
  });

  it("should block high risk tool by default policy", async () => {
    await expect(engine.executeTool("rm", { path: "/" }))
      .rejects.toThrowError(/is not allowed by current policy/);
  });

  it("should allow high risk tool if configured", async () => {
    const permissiveEngine = new SimpleToolEngine({ allowHighRisk: true });
    permissiveEngine.register(highRiskTool);

    const result = await permissiveEngine.executeTool("rm", { path: "/tmp/file" });
    expect(result).toBe("Deleted /tmp/file");
  });
});
