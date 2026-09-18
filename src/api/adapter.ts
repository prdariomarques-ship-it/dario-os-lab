import { TaskEngine } from "../core/engine.js";
import { TelemetryEmitter } from "../observability/types.js";
import { EngineEvent, EngineObserver } from "../core/types.js";
import { MemoryStore } from "../memory/types.js";
import { ToolEngine } from "../tools/types.js";
import { DashboardMetrics, ExecutionLogEntry, TaskExecutionUIState, MemoryManagerUIState, AgentDetail, SkillUI, PublicTaskSummary } from "./contracts.js";
import type { Task } from "../core/types.js";

// NO-CoT CONTRACT (list surfaces): serialize a Task down to the public
// summary shape. `context` and `metadata` are deliberately dropped —
// metadata.executionHistory carries the agent's raw THINK reasoning and must
// never cross the API boundary wholesale. /api/tasks/:id remains the only
// task-bearing surface and exposes a curated, THINK-redacted trace.
export function toPublicTaskSummary(task: Task): PublicTaskSummary {
  return {
    id: task.id,
    objective: task.objective,
    status: task.status,
    ...(task.agentId ? { agentId: task.agentId } : {}),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export class DARIUSUIAdapter implements EngineObserver {
  private logs: ExecutionLogEntry[] = [];

  constructor(
    private taskEngine: TaskEngine,
    private memoryStore: MemoryStore,
    private toolEngine: ToolEngine,
    private telemetry?: TelemetryEmitter
  ) {
    this.taskEngine.subscribe(this);
    if (this.telemetry) {
      this.telemetry.subscribe((event) => {
         // Map TelemetryEvent to ExecutionLogEntry
         this.logs.unshift({
           id: event.id,
           taskId: event.taskId,
           executionId: event.executionId || event.taskId,
           timestamp: event.timestamp,
           eventType: event.eventType as any,
           status: event.eventType.includes("FAILED") ? "FAILED" : "SUCCESS",
           payload: event.payload
         });
         if (this.logs.length > 100) this.logs.pop();
      });
    }
  }

  onEvent(event: EngineEvent): void {
    let eventType: ExecutionLogEntry["eventType"] = "PENDING";
    let status: ExecutionLogEntry["status"] = "SUCCESS";

    switch (event.type) {
      case "TASK_CREATED": eventType = "PENDING"; break;
      case "STATE_CHANGED":
        if (event.payload.state === "OBSERVE") eventType = "OBSERVE";
        else if (event.payload.state === "THINK") eventType = "THINK";
        else if (event.payload.state === "ACT") eventType = "ACT";
        else if (event.payload.state === "VERIFY") eventType = "VERIFY";
        else if (event.payload.state === "DONE") eventType = "FINISHED";
        else if (event.payload.state === "ERROR") { eventType = "ERROR"; status = "FAILED"; }
        else if (event.payload.state === "WAITING_APPROVAL") { eventType = "APPROVAL_REQUEST"; status = "PENDING"; }
        else eventType = "PENDING";
        break;
      case "TASK_COMPLETED": eventType = "FINISHED"; break;
      case "TASK_FAILED": eventType = "ERROR"; status = "FAILED"; break;
      case "TASK_CANCELLED": eventType = "CANCELLED"; status = "CANCELLED"; break;
      case "APPROVAL_REQUESTED": eventType = "APPROVAL_REQUEST"; status = "PENDING"; break;
    }

    this.logs.unshift({
      id: Math.random().toString(36).substring(7),
      taskId: event.taskId,
      executionId: event.taskId, // Simplified for now
      timestamp: event.timestamp,
      eventType,
      status,
      payload: event.payload
    });

    // Keep only last 100 logs
    if (this.logs.length > 100) this.logs.pop();
  }

  getDashboardMetrics(): DashboardMetrics {
    // Assuming tasks can be derived from logs since TaskEngine doesn't expose listTasks
    const activeTasksIds = new Set(this.logs.filter(l => l.eventType !== "FINISHED" && l.eventType !== "ERROR").map(l => l.taskId));
    const completedTasksIds = new Set(this.logs.filter(l => l.eventType === "FINISHED").map(l => l.taskId));
    const failedTasksIds = new Set(this.logs.filter(l => l.eventType === "ERROR").map(l => l.taskId));

    const activeTasksCount = activeTasksIds.size;
    const completedTasksCount = completedTasksIds.size;
    const failedTasksCount = failedTasksIds.size;

    const agents = this.taskEngine.getAgents();

    return {
      totalAgents: agents.length,
      activeAgents: undefined, // Unavailable: we cannot currently infer active execution safely
      pausedAgents: undefined, // Unavailable: no store for this metric right now
      tasks: {
        active: activeTasksCount,
        completed: completedTasksCount,
        failed: failedTasksCount
      },
      health: {
        status: "UNKNOWN",
        latencyMs: undefined, // Unavailable: Not tracking real latency yet
        memoryUsageMB: undefined // Keeping it clean without false metrics
      },
      recentActivities: this.logs.slice(0, 10)
    };
  }

  getTaskState(taskId: string): TaskExecutionUIState | null {
    const task = this.taskEngine.getTask(taskId);
    if (!task) return null;

    const taskLogs = this.logs.filter(l => l.taskId === taskId);
    const rawTrace = Array.isArray(task.metadata?.executionHistory) ? task.metadata?.executionHistory : [];

    // NO-CoT CONTRACT (product spec, surface section): the UI trace exposes
    // plan structure (state + timestamp), results, evidence, tool output and
    // status — never the agent's internal THINK reasoning. Enforcement lives
    // here at the API boundary so no agent implementation can leak raw
    // chain-of-thought through /api/tasks/:id. THINK step output for
    // deterministic verticals is a curated one-line plan summary; for
    // LLM-backed agents it is raw reasoning — both are withheld uniformly.
    const trace = (rawTrace as Array<{ state?: string; output?: string; error?: string; timestamp?: unknown }>).map(step =>
      step.state === "THINK" && typeof step.output === "string" && step.output.length > 0
        ? { ...step, output: "(internal planning step — content not exposed)" }
        : step
    );

    let currentState: TaskExecutionUIState["currentState"] = "IDLE";
    if (taskLogs.length > 0) {
       // Latest state from logs
       const latestStateEvent = taskLogs.find(l =>
          l.eventType === "OBSERVE" || l.eventType === "THINK" || l.eventType === "ACT" ||
          l.eventType === "VERIFY" || l.eventType === "APPROVAL_REQUEST" || l.eventType === "ERROR" || l.eventType === "FINISHED"
       );

       if (latestStateEvent) {
          if (latestStateEvent.eventType === "APPROVAL_REQUEST") currentState = "WAITING_APPROVAL";
          else if (latestStateEvent.eventType === "FINISHED") currentState = "DONE";
          else currentState = latestStateEvent.eventType as any;
       }
    }

    return {
      taskId: task.id,
      objective: task.objective,
      status: task.status,
      currentState: currentState,
      iterations: typeof task.metadata?.iterations === 'number' ? task.metadata.iterations : 0,
      trace: trace as any || []
    };
  }

  pauseTask(taskId: string): void {
    this.taskEngine.pauseForApproval(taskId);
  }

  resumeTask(taskId: string): void {
    this.taskEngine.resumeTask(taskId);
  }

  getAgentDetails(agentId: string): AgentDetail | null {
    const agents = this.taskEngine.getAgents();
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return null;

    // Only associate tasks that are explicitly bound to this agent in the TaskEngine
    const allTasks = this.logs.map(l => l.taskId);
    const uniqueTasks = Array.from(new Set(allTasks));
    const recentTasks = uniqueTasks
      .map(id => this.taskEngine.getTask(id))
      .filter((t): t is any => t !== undefined && t.agentId === agentId);

    // RC VALIDATION FIX: build the detail explicitly instead of spreading the
    // raw Agent instance. Agent implementations hold engine internals
    // (contextEngine/modelRouter; finance agents reach workflow -> engine),
    // which leaked internal structure into the API response and could produce
    // circular JSON. Public Agent fields only, per the UI contract.
    // NO-COT FIX (release freeze): recentTasks used to return raw Task objects
    // whose metadata.executionHistory carries raw THINK reasoning. Serialize
    // every task through the public summary shape instead.
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      toolsAttached: this.toolEngine.listTools ? this.toolEngine.listTools() as any : [],
      skillsAttached: [], // NOT_CONNECTED - Skills Engine explicitly not linked to UI in this version
      recentTasks: recentTasks.map(toPublicTaskSummary)
    };
  }

  async getMemoryManagerUIState(): Promise<MemoryManagerUIState> {
    // Note: this implementation requires async but adapter methods might be used synchronously by the UI depending on the framework.
    // We provide a best-effort async method mapping to the store.
    const shortTerm = await this.memoryStore.search({ type: "SHORT_TERM" });
    const session = await this.memoryStore.search({ type: "SESSION" });
    const longTerm = await this.memoryStore.search({ type: "LONG_TERM" });

    const all = [...shortTerm, ...session, ...longTerm].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      stats: {
        shortTermCount: shortTerm.length,
        sessionCount: session.length,
        longTermCount: longTerm.length
      },
      recentEntries: all.slice(0, 50)
    };
  }

  getSkillsDirectory(): SkillUI[] {
    return []; // NOT_CONNECTED - Skills Engine explicitly not linked to UI in this version
  }
}
