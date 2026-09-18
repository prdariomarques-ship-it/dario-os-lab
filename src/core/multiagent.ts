import { TaskEngine } from "./engine.js";
import { AutonomousAgent } from "./agent.js";
import { Task } from "./types.js";

// The Supervisor delegates tasks to available specialized agents.
export class SupervisorAgent {
  constructor(private id: string, private taskEngine: TaskEngine, private agents: AutonomousAgent[]) {}

  async delegateTask(objective: string): Promise<Task> {
    // Naive selection logic based on objective keyword
    let selectedAgent = this.agents[0];

    for (const agent of this.agents) {
       if (agent.description && objective.toLowerCase().includes(agent.description.toLowerCase())) {
          selectedAgent = agent;
          break;
       }
    }

    const task = this.taskEngine.createTask(objective, "Delegated by supervisor " + this.id);
    return await this.taskEngine.executeTask(task.id, selectedAgent.id);
  }
}
