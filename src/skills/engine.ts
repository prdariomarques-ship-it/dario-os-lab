import { Skill, SkillEngine } from "./types.js";

export class SimpleSkillEngine implements SkillEngine {
  private skills: Map<string, Skill> = new Map();

  registerSkill(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill ${skill.id} already registered`);
    }
    this.skills.set(skill.id, skill);
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  listSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  async executeSkill(id: string, params: any, context: any): Promise<any> {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new Error(`Skill ${id} not found`);
    }

    if (skill.preconditions && !skill.preconditions(context)) {
      throw new Error(`Preconditions failed for skill ${id}`);
    }

    try {
      return await skill.execute(params, context);
    } catch (e) {
      throw new Error(`Skill ${id} execution failed: ${(e as Error).message}`);
    }
  }
}
