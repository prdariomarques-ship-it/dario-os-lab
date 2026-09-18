import { TaskEngine } from "./engine.js";

export interface ScheduledTask {
  id: string;
  objective: string;
  agentId: string;
  intervalMs: number;
  lastRun?: Date;
}

export class TaskScheduler {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private timer?: NodeJS.Timeout;

  constructor(private engine: TaskEngine) {}

  schedule(taskDef: ScheduledTask) {
    this.scheduledTasks.set(taskDef.id, taskDef);
  }

  unschedule(id: string) {
    this.scheduledTasks.delete(id);
  }

  start(tickMs = 1000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private tick() {
    const now = new Date();
    for (const task of this.scheduledTasks.values()) {
      if (!task.lastRun || (now.getTime() - task.lastRun.getTime() >= task.intervalMs)) {
        // Time to run
        task.lastRun = now;
        this.runTask(task);
      }
    }
  }

  private async runTask(scheduled: ScheduledTask) {
    try {
      const task = this.engine.createTask(scheduled.objective, "Scheduled execution");
      await this.engine.executeTask(task.id, scheduled.agentId);
    } catch (e) {
      console.error(`Scheduled task ${scheduled.id} failed:`, e);
    }
  }
}
