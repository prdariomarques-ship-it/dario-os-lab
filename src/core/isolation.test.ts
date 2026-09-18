import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * PLUGIN ISOLATION (static proof, final RC hardening):
 * the Core layer (src/core, src/planner, src/model, src/memory, src/tools,
 * src/skills, src/context, src/verification) must NEVER import from
 * src/plugins/** — plugins are leaves that consume Core engines, never the
 * reverse. Removing every plugin must leave the Core compiling and green
 * (functional proof: the finance e2e "core keeps working without it" test).
 */

const CORE_ROOTS = [
  "src/core",
  "src/planner",
  "src/model",
  "src/memory",
  "src/tools",
  "src/skills",
  "src/context",
  "src/verification",
];

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__pycache__" || entry === "node_modules") continue;
      walkTsFiles(full, acc);
    } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("plugin isolation (static)", () => {
  it("no Core-layer file imports from src/plugins/**", () => {
    const violations: string[] = [];
    for (const root of CORE_ROOTS) {
      for (const file of walkTsFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (/from\s+["'].*plugins\//.test(src) || /import\s+["'].*plugins\//.test(src)) {
          violations.push(file);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("finance plugin imports Core engines/types only (no Core file touched by side effect)", () => {
    // Complement: nothing in src/core IMPORTS anything finance-related.
    // Doc-comment mentions (e.g. "See DARIUS_FINANCE.md") are not code
    // dependencies and are ignored — only import statements count.
    const violations: string[] = [];
    for (const file of walkTsFiles("src/core")) {
      const src = readFileSync(file, "utf8");
      if (/^\s*import\s.*finance/im.test(src) || /from\s+["'][^"']*finance/im.test(src)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});
