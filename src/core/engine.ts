import { randomUUID } from "node:crypto";
import { Agent, EngineEvent, EngineObserver, ExecutionState, ExecutionStep, ExecutionStore, Task, TaskExecution, TaskStatus, TaskStore } from "./types.js";
import { VerificationEngine } from "../verification/types.js";

export class InMemoryTaskStore implements TaskStore, ExecutionStore {
  private tasks: Map<string, Task> = new Map();
  private executions: Map<string, TaskExecution> = new Map();

  saveTask(task: Task): void {
    this.tasks.set(task.id, { ...task });
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  listTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  deleteTask(id: string): boolean {
    return this.tasks.delete(id);
  }

  saveExecution(execution: TaskExecution): void {
    this.executions.set(execution.id, { ...execution });
  }

  getExecution(id: string): TaskExecution | undefined {
    return this.executions.get(id);
  }

  getByTaskId(taskId: string): TaskExecution[] {
    return Array.from(this.executions.values()).filter(e => e.taskId === taskId).sort((a,b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
}

export class TaskEngine {
  private taskStore: TaskStore;
  private execStore: ExecutionStore;
  private agents: Map<string, Agent> = new Map();
  private maxIterations = 10;
  private observers: EngineObserver[] = [];
  private activeLoops: Set<string> = new Set();

  // Optional verification engine
  private verifier?: VerificationEngine;

  constructor(store?: TaskStore & ExecutionStore, config?: { maxIterations?: number, verifier?: VerificationEngine }, planner?: any, tools?: any, memory?: any, verifier?: VerificationEngine) {
    const inMem = new InMemoryTaskStore();
    this.taskStore = store || inMem;
    this.execStore = store || inMem;
    if (config?.maxIterations) {
      this.maxIterations = config.maxIterations;
    }
    if (config?.verifier) {
      this.verifier = config.verifier;
    }
    if (verifier) {
      this.verifier = verifier;
    }
  }

  subscribe(observer: EngineObserver) {
    this.observers.push(observer);
  }

  private emit(event: EngineEvent) {
    for (const obs of this.observers) {
      try { obs.onEvent(event); } catch (e) { console.error("Observer error", e); }
    }
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Store = authoritative state.
   * TaskStore.saveTask replaces the stored object with a copy, so external
   * pauseForApproval/resumeTask/rejectTask/cancelTask calls mutate a different
   * object than any locally-held Task reference. Every execution path must
   * re-read the authoritative status before acting on (or persisting) a local
   * reference, otherwise terminal/gate states (PAUSED, CANCELLED, FAILED,
   * COMPLETED) can be silently overwritten. See DARIUS_FINANCE.md.
   */
  private syncWithStore(task: Task): void {
    const authoritative = this.taskStore.getTask(task.id);
    if (authoritative && authoritative.status !== task.status) {
      task.status = authoritative.status;
      if (authoritative.error) task.error = authoritative.error;
    }
  }

  createTask(objective: string, context?: string, metadata?: Record<string, unknown>): Task {
    const task: Task = {
      id: randomUUID(),
      objective,
      status: "PENDING",
      context,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.taskStore.saveTask(task);
    this.emit({ type: "TASK_CREATED", taskId: task.id, timestamp: new Date(), payload: { objective } });
    return task;
  }

  getTask(id: string): Task | undefined {
    return this.taskStore.getTask(id);
  }

  private recordStep(execution: TaskExecution, state: ExecutionState, output?: string, error?: string) {
    execution.state = state;
    const step = { state, timestamp: new Date(), output, error };
    execution.history.push(step);
    execution.updatedAt = new Date();
    this.execStore.saveExecution(execution); // CHECKPOINT
    this.emit({ type: "STATE_CHANGED", taskId: execution.taskId, timestamp: new Date(), payload: { state, output, error } });
  }

  pauseForApproval(taskId: string): void {
    const task = this.taskStore.getTask(taskId);
    // Unknown ids are an operator error: fail loudly (consistent with
    // cancelTask). Wrong-status ids remain a silent no-op: the pause is
    // only meaningful for a RUNNING task.
    if (!task) throw new Error(`Task with id ${taskId} not found`);
    if (task.status === "RUNNING") {
      task.status = "PAUSED";
      this.taskStore.saveTask(task);
      this.emit({ type: "APPROVAL_REQUESTED", taskId, timestamp: new Date(), payload: {} });
    }
  }

  resumeTask(taskId: string): void {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task with id ${taskId} not found`);
    if (task.status === "PAUSED") {
      task.status = "RUNNING";
      this.taskStore.saveTask(task);

      if (!this.activeLoops.has(taskId)) {
        const execs = this.execStore.getByTaskId(taskId);
        let execution = execs.length > 0 ? execs[0] : null;
        if (execution && execution.state !== "DONE" && execution.state !== "ERROR") {
           this.runExecutionLoop(task, execution, 30000);
        }
      }
    }
  }

  rejectTask(taskId: string, reason: string): void {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task with id ${taskId} not found`);
    if (task.status === "PAUSED") {
      task.status = "FAILED";
      task.error = `REJECTED: ${reason}`;
      this.taskStore.saveTask(task);
      this.emit({ type: "TASK_FAILED", taskId: task.id, timestamp: new Date(), payload: { error: task.error } });
    } else {
      throw new Error("Can only reject a task that is PAUSED for approval");
    }
  }

  async recoverAndResume(taskId: string, timeoutMs: number = 30000): Promise<Task> {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status === "COMPLETED" || task.status === "FAILED" || task.status === "CANCELLED") {
      return task;
    }

    if (task.status === "PAUSED") {
      return task;
    }

    task.status = "RUNNING";
    this.taskStore.saveTask(task);

    const execs = this.execStore.getByTaskId(taskId);
    let execution = execs.length > 0 ? execs[0] : null;

    if (execution && execution.state === "ACT") {
      this.failTask(task, execution, "CRASH RECOVERY: Ambiguous state interrupted during ACT. Requires human reconciliation.");
      return task;
    }

    if (!execution || execution.state === "DONE" || execution.state === "ERROR") {
      execution = {
        id: randomUUID(),
        taskId,
        agentId: task.agentId || "unknown",
        state: "IDLE",
        iterations: 0,
        maxIterations: this.maxIterations,
        history: [],
        startedAt: new Date(),
        updatedAt: new Date()
      };
    }

    if (task.agentId) {
      execution.agentId = task.agentId;
    }

    return this.runExecutionLoop(task, execution, timeoutMs);
  }

  async executeTask(taskId: string, agentId: string, timeoutMs: number = 30000): Promise<Task> {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task with id ${taskId} not found`);

    if (task.status === "CANCELLED") throw new Error(`Cannot execute a cancelled task`);
    if (task.status === "COMPLETED") throw new Error(`Cannot execute a completed task`);
    if (task.status === "RUNNING") throw new Error(`Task is already running`);
    // APPROVAL-GATE FIX: a paused task is waiting for human approval —
    // only resumeTask() may return it to RUNNING.
    if (task.status === "PAUSED") throw new Error(`Task is paused awaiting approval; use resumeTask`);

    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent with id ${agentId} not found`);

    task.status = "RUNNING";
    task.agentId = agent.id;
    task.updatedAt = new Date();
    this.taskStore.saveTask(task);

    const execution: TaskExecution = {
      id: randomUUID(),
      taskId,
      agentId,
      state: "IDLE",
      iterations: 0,
      maxIterations: this.maxIterations,
      history: [],
      startedAt: new Date(),
      updatedAt: new Date()
    };
    this.execStore.saveExecution(execution);

    return this.runExecutionLoop(task, execution, timeoutMs);
  }

  private async runExecutionLoop(task: Task, execution: TaskExecution, timeoutMs: number): Promise<Task> {
    const agent = this.agents.get(execution.agentId);
    if (!agent) throw new Error(`Agent with id ${execution.agentId} not found for recovery`);

    if (this.activeLoops.has(task.id)) {
      return task;
    }

    this.activeLoops.add(task.id);

    return new Promise((resolve) => {
      let isTimeout = false;
      let timeoutId: NodeJS.Timeout | null = null;
      let totalRunningTime = 0;
      const pollingInterval = 50;

      const setExecutionTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          // BUDGET SEMANTICS (final RC hardening): the execution timeout
          // measures ACTIVE execution time only. A human gate (PAUSED) or a
          // terminal decision (CANCELLED / REJECTED) that landed while the
          // agent was working owns the task — the timer must never convert
          // WAITING_APPROVAL into FAILED("timed out") nor overwrite the
          // audit-relevant error of a state that landed during the last
          // await. The loop's own pause/terminal handling exits cleanly.
          this.syncWithStore(task);
          if (task.status !== "RUNNING") {
            return;
          }
          isTimeout = true;
          this.failTask(task, execution, "Task execution timed out");
          this.activeLoops.delete(task.id);
          resolve(task);
        }, timeoutMs - totalRunningTime);
      };

      setExecutionTimeout();

      const runLoop = async () => {
        try {
          if (agent.execute && (!agent.observe || !agent.think || !agent.act)) {
             let isDone = false;
             while (!isDone && (execution.iterations < execution.maxIterations)) {
               // APPROVAL-GATE FIX (bug A): the simple path never checked task
               // status, so a pause/cancel/reject landing during or between
               // execute() calls was invisible and the loop kept running the
               // agent. Respect the authoritative store state every iteration.
               this.syncWithStore(task);
               if (task.status === "PAUSED") {
                 if (execution.state !== "WAITING_APPROVAL") {
                   this.recordStep(execution, "WAITING_APPROVAL", "Paused waiting for human approval");
                 }
                 break; // resumeTask() restarts the loop from the store
               }
               if (task.status !== "RUNNING") {
                 break; // CANCELLED / FAILED / COMPLETED: stop, never resume on our own
               }
               execution.iterations++;
               const result = await agent.execute(task);
               isDone = await this.completeTaskWithVerification(task, execution, result);
             }
             if (!isDone && task.status === "RUNNING") {
                this.failTask(task, execution, "Exceeded maximum iterations without completing");
             }
             if (timeoutId) clearTimeout(timeoutId);
             this.activeLoops.delete(task.id);
             return resolve(task);
          }

          let wasPaused = false;
          while (execution.iterations < execution.maxIterations && !isTimeout && (task.status === "RUNNING" || task.status === "PAUSED")) {
            // APPROVAL-GATE FIX: re-read the authoritative status every
            // iteration (see syncWithStore) so external gate transitions are
            // observed instead of re-running the agent.
            this.syncWithStore(task);

            if (task.status === "PAUSED") {
              if (!wasPaused) {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = null;
                if (execution.state !== "WAITING_APPROVAL") {
                  this.recordStep(execution, "WAITING_APPROVAL", "Paused waiting for human approval");
                }
                wasPaused = true;
              }
              await new Promise(r => setTimeout(r, pollingInterval));
              const freshTask = this.taskStore.getTask(task.id);
              if (freshTask && freshTask.status === "FAILED") {
                 task.status = "FAILED";
                 task.error = freshTask.error;
              } else if (freshTask && freshTask.status === "RUNNING") {
                 task.status = "RUNNING";
              }
              continue;
            }

            if (wasPaused && task.status === "RUNNING") {
              wasPaused = false;
              setExecutionTimeout();
            }

            const loopStartTime = Date.now();
            const lastState = execution.state;

            if (lastState === "OBSERVE") {
               // Resume from think
            } else if (lastState === "THINK") {
               // Resume from act
            } else {
               execution.iterations++;
               this.recordStep(execution, "OBSERVE");
               if (agent.observe) {
                 const obsOutput = await agent.observe(task, execution);
                 if (isTimeout) return;
                 execution.history[execution.history.length - 1].output = obsOutput;
                 this.execStore.saveExecution(execution);
               }
            }

            if (lastState !== "THINK" && task.status === "RUNNING" && execution.state !== "ERROR") {
              this.recordStep(execution, "THINK");
              if (agent.think) {
                const thinkOutput = await agent.think(task, execution);
                if (isTimeout) return;
                execution.history[execution.history.length - 1].output = thinkOutput;
                this.execStore.saveExecution(execution);
              }
            }

            let isDone = false;
            let finalResult = "";
            if (task.status === "RUNNING" && execution.state !== "ERROR") {
              this.recordStep(execution, "ACT");
              if (agent.act) {
                 const actOutput = await agent.act(task, execution);
                 if (isTimeout) return;
                 execution.history[execution.history.length - 1].output = actOutput;
                 this.execStore.saveExecution(execution);
                 if (actOutput && actOutput.startsWith("DONE:")) {
                    isDone = true;
                    finalResult = actOutput.substring(5).trim();
                 }
              } else {
                 isDone = true;
                 finalResult = "Agent completed without act phase";
              }
            }

            totalRunningTime += (Date.now() - loopStartTime);

            if (isDone) {
              const shouldTerminate = await this.completeTaskWithVerification(task, execution, finalResult);
              if (shouldTerminate) {
                break;
              } else {
                // Retry scenario: Reset state for next iteration
                execution.state = "IDLE"; // Reset to IDLE so it starts fresh from OBSERVE
                execution.history.push({
                   state: "IDLE",
                   timestamp: new Date()
                });
                // APPROVAL-GATE FIX (bug B): never persist a locally-forced
                // RUNNING over a newer store state (PAUSED/CANCELLED/FAILED).
                this.syncWithStore(task);
                if (task.status === "RUNNING") {
                  this.taskStore.saveTask(task);
                }
                // Also reset isDone for the loop
                isDone = false;
              }
            }
          }

          if (task.status === "RUNNING" && !isTimeout) {
             this.failTask(task, execution, "Exceeded maximum iterations without completing");
          }

          if (task.status === "FAILED" && task.error?.startsWith("REJECTED:")) {
             this.recordStep(execution, "ERROR", undefined, task.error);
          }

          if (timeoutId) clearTimeout(timeoutId);
          this.activeLoops.delete(task.id);
          resolve(task);

        } catch (error) {
          if (!isTimeout) {
            this.failTask(task, execution, error instanceof Error ? error.message : String(error));
            if (timeoutId) clearTimeout(timeoutId);
            this.activeLoops.delete(task.id);
            resolve(task);
          }
        }
      };

      runLoop();
    });
  }

  private async completeTaskWithVerification(task: Task, execution: TaskExecution, result: string): Promise<boolean> {
    // APPROVAL-GATE FIX (bug B): sync before completing or retrying so no
    // verification/retry bookkeeping can overwrite a newer store state —
    // e.g. a pauseForApproval that landed while the agent was working.
    // WAITING_APPROVAL must never become COMPLETED.
    this.syncWithStore(task);
    if (task.status !== "RUNNING") {
      return true; // Stop the loop; the task keeps its authoritative status.
    }

    if (this.verifier) {
      this.recordStep(execution, "VERIFY");
      const vResult = await this.verifier.verify(task, result);
      execution.history[execution.history.length - 1].output = `Verification: ${vResult.passed ? 'PASS' : 'FAIL'}`;
      this.execStore.saveExecution(execution);

      if (!vResult.passed) {
         // Check for retry policy
         const maxRetries = (task.metadata?.maxRetries as number) ?? 0;
         const currentRetries = (task.metadata?.currentRetries as number) ?? 0;

         if (currentRetries < maxRetries) {
           // Re-sync: the verify() await may have let a gate transition
           // (pauseForApproval/cancel) land — never persist stale RUNNING.
           this.syncWithStore(task);
           task.metadata = {
             ...task.metadata,
             currentRetries: currentRetries + 1,
             lastVerificationError: vResult.reason
           };
           this.taskStore.saveTask(task);
           return false; // Tells the execution loop to retry
         }

         // Verification failed and no more retries, fail the task
         this.failTask(task, execution, `Verification failed: ${vResult.reason}`);
         return true; // Execution loop should terminate
      }
    }

    // Re-sync after await points: a pauseForApproval/cancel that landed while
    // verification was in flight must never be overridden by COMPLETED
    // (WAITING_APPROVAL must not become COMPLETED).
    this.syncWithStore(task);
    if (task.status !== "RUNNING") {
      return true; // Stop the loop; the task keeps its authoritative status.
    }

    this.recordStep(execution, "DONE");
    task.status = "COMPLETED";
    task.result = result;
    task.metadata = { ...task.metadata, executionHistory: execution.history };
    task.updatedAt = new Date();
    this.taskStore.saveTask(task);
    this.emit({ type: "TASK_COMPLETED", taskId: task.id, timestamp: new Date(), payload: { result } });
    return true; // Execution loop should terminate
  }

  private failTask(task: Task, execution: TaskExecution, errorMsg: string) {
    this.recordStep(execution, "ERROR", undefined, errorMsg);
    // Re-sync before failing: a human CANCELLED that landed while the agent
    // was working is a deliberate terminal decision and outranks an internal
    // failure. The error is still recorded on the task for auditability.
    this.syncWithStore(task);
    if (task.status === "CANCELLED") {
      task.error = errorMsg;
      task.updatedAt = new Date();
      this.taskStore.saveTask(task);
      return;
    }
    if (task.status === "PAUSED") {
      // INVARIANT (approval gate): PAUSED never becomes FAILED — the timer
      // path already obeys this; the internal-failure path must obey it too.
      // A gate that landed while the agent was failing keeps ownership of the
      // task: the error is recorded (task.error + history) for the human
      // decision, and the execution returns to a resumable state (resumeTask
      // deliberately ignores DONE/ERROR executions) so an approval can retry
      // the failed step cleanly.
      task.error = errorMsg;
      task.updatedAt = new Date();
      this.taskStore.saveTask(task);
      execution.state = "IDLE";
      this.execStore.saveExecution(execution);
      return;
    }
    task.status = "FAILED";
    task.error = errorMsg;
    task.metadata = { ...task.metadata, executionHistory: execution.history };
    task.updatedAt = new Date();
    this.taskStore.saveTask(task);
    this.emit({ type: "TASK_FAILED", taskId: task.id, timestamp: new Date(), payload: { error: errorMsg } });
  }

  cancelTask(taskId: string): Task {
    const task = this.taskStore.getTask(taskId);
    if (!task) throw new Error(`Task with id ${taskId} not found`);
    // FINAL GATE cancel matrix: CANCELLED is a terminal state. Re-cancelling
    // used to be a silent no-op that re-emitted TASK_CANCELLED, so observers
    // (UI logs, telemetry, finance audit) could see a task "cancelled" twice.
    // It now fails loudly, exactly like COMPLETED/FAILED.
    if (task.status === "COMPLETED" || task.status === "FAILED" || task.status === "CANCELLED")
      throw new Error(`Cannot cancel a task that has already finished`);

    task.status = "CANCELLED";
    task.updatedAt = new Date();
    this.taskStore.saveTask(task);
    // OBSERVABILITY FIX: cancellation used to be the only terminal transition
    // with no engine event — observers (UI logs, telemetry, finance audit)
    // never learned a task was cancelled until they re-polled the store.
    this.emit({ type: "TASK_CANCELLED", taskId: task.id, timestamp: new Date(), payload: {} });
    return task;
  }
}
