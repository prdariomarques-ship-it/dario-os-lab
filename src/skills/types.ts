export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  preconditions?: (context: any) => boolean;
  execute: (params: any, context: any) => Promise<any>;
}

export interface SkillEngine {
  registerSkill(skill: Skill): void;
  getSkill(id: string): Skill | undefined;
  listSkills(): Skill[];
  executeSkill(id: string, params: any, context: any): Promise<any>;
}
