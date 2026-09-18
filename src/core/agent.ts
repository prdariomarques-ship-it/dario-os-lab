import { Agent, Task, TaskExecution } from "./types.js";
import { ContextEngine } from "../context/types.js";
import { ModelRouter } from "../model/types.js";
import { ToolEngine } from "../tools/types.js";

export class AutonomousAgent implements Agent {
  public id: string;
  public name: string;

  constructor(
    id: string,
    name: string,
    private contextEngine: ContextEngine,
    private modelRouter: ModelRouter,
    private toolEngine?: ToolEngine,
    public description?: string
  ) {
    this.id = id;
    this.name = name;
  }

  async observe(task: Task, context: TaskExecution): Promise<string> {
    const compiled = await this.contextEngine.buildContext(task, context, "observation");
    return `Agent ${this.name} initialized observe cycle ${context.iterations}.`;
  }

  async think(task: Task, context: TaskExecution): Promise<string> {
    const compiledContext = await this.contextEngine.buildContext(task, context, "planning");
    const response = await this.modelRouter.route({
      context: compiledContext,
      temperature: 0.7,
    });
    return response.text;
  }

  async act(task: Task, context: TaskExecution): Promise<string> {
    const compiledContext = await this.contextEngine.buildContext(task, context, "action");

    // Naive tool schema injection for MVP
    if (this.toolEngine) {
       compiledContext.fullPrompt += "\n\nAvailable tools: " + JSON.stringify(this.toolEngine.listTools ? this.toolEngine.listTools() : "toolEngine defined");
    }

    const response = await this.modelRouter.route({
      context: compiledContext,
      temperature: 0.2,
    });

    const llmOutput = response.text;

    // Check if output is a tool call. For this MVP, we assume a simple JSON syntax:
    // TOOL_CALL: {"name": "calculator", "params": {"a": 1, "b": 2}}
    if (this.toolEngine && llmOutput.includes("TOOL_CALL:")) {
       try {
         const jsonStr = llmOutput.split("TOOL_CALL:")[1].trim();
         const callDef = JSON.parse(jsonStr);
         if (callDef.name && callDef.params) {
            const result = await this.toolEngine.executeTool(callDef.name, callDef.params, { taskId: task.id, executionId: context.id });
            return `TOOL_RESULT [${callDef.name}]: ${JSON.stringify(result)}`;
         }
       } catch (e) {
         return `TOOL_ERROR: Failed to parse or execute tool call. ${(e as Error).message}`;
       }
    }

    return llmOutput;
  }
}
