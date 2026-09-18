import { ToolEngine, Tool, ToolDefinition } from "../tools/types.js";

export interface MCPClient {
  listTools(): Promise<ToolDefinition[]>;
  callTool(name: string, params: any): Promise<any>;
}

export class MCPAdapter {
  constructor(private client: MCPClient, private toolEngine: ToolEngine) {}

  async loadTools() {
    const definitions = await this.client.listTools();
    for (const def of definitions) {
      // Create a native DARIUS Tool wrapper around the remote MCP tool
      const toolWrapper: Tool = {
        name: def.name,
        description: def.description,
        risk: def.risk || "MEDIUM", // Safely default to medium risk if not provided
        schema: def.schema,
        execute: async (params, ctx) => {
           // We could inject auth/sandbox here if the MCP transport needs it
           return await this.client.callTool(def.name, params);
        }
      };
      this.toolEngine.register(toolWrapper);
    }
  }
}
