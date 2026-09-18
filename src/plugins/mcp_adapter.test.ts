import { describe, expect, it, vi } from "vitest";
import { MCPAdapter, MCPClient } from "./mcp_adapter.js";
import { SimpleToolEngine } from "../tools/engine.js";

describe("MCPAdapter", () => {
  it("should list and register remote MCP tools natively into DARIUS ToolEngine", async () => {
    const mockClient: MCPClient = {
      listTools: vi.fn().mockResolvedValue([
        { name: "remote_math", description: "Remote addition", schema: { a: "number" } }
      ]),
      callTool: vi.fn().mockResolvedValue("42")
    };

    const engine = new SimpleToolEngine();
    const adapter = new MCPAdapter(mockClient, engine);

    await adapter.loadTools();

    const registered = engine.getTool("remote_math");
    expect(registered).toBeDefined();

    const res = await engine.executeTool("remote_math", { a: 21 });
    expect(res).toBe("42");
    expect(mockClient.callTool).toHaveBeenCalledWith("remote_math", { a: 21 });
  });
});
