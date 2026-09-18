import { describe, expect, it, beforeEach } from "vitest";
import { SimpleSkillEngine } from "./engine.js";
import { Skill } from "./types.js";

describe("SimpleSkillEngine", () => {
  let engine: SimpleSkillEngine;

  beforeEach(() => {
    engine = new SimpleSkillEngine();
  });

  const dummySkill: Skill = {
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    version: "1.0",
    preconditions: (ctx) => ctx.role === "admin",
    execute: async (params, ctx) => {
      return `Executed with ${params.val} for ${ctx.role}`;
    }
  };

  it("should register and list skills", () => {
    engine.registerSkill(dummySkill);
    const skills = engine.listSkills();
    expect(skills.length).toBe(1);
    expect(skills[0].id).toBe("test-skill");
  });

  it("should fail to execute if preconditions fail", async () => {
    engine.registerSkill(dummySkill);
    await expect(engine.executeSkill("test-skill", { val: "x" }, { role: "user" }))
      .rejects.toThrow("Preconditions failed for skill test-skill");
  });

  it("should execute if preconditions pass", async () => {
    engine.registerSkill(dummySkill);
    const res = await engine.executeSkill("test-skill", { val: "x" }, { role: "admin" });
    expect(res).toBe("Executed with x for admin");
  });
});
