import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Agent } from "../core/types.js";

/**
 * NO-CoT HTTP sentinel probe (release freeze, §3).
 *
 * The user-facing demand: "Faça um teste que execute um THINK contendo a
 * string sentinela SECRET_INTERNAL_THOUGHT_SENTINEL. Depois consulte
 * /api/tasks/:id, /api/logs, Web execution trace. A string NÃO pode aparecer
 * em nenhuma superfície pública de observabilidade/UI."
 *
 * This probe boots the REAL express app from src/server.ts (same wiring as
 * production: same routes, same adapter, same serialization boundary) with
 * listening disabled, registers a probe agent whose THINK output carries the
 * sentinel, executes a real task through the engine, then fetches EVERY GET
 * surface over real HTTP and asserts the sentinel appears nowhere while the
 * public result does appear on the curated trace.
 */

const SENTINEL = "SECRET_INTERNAL_THOUGHT_SENTINEL";
const PUBLIC_MARK = "PUBLIC_RESULT_SENTINEL";

let tmpDir: string;
let httpServer: Server;
let baseUrl: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engineRef: any;

async function get(pathname: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${baseUrl}${pathname}`, { headers: { connection: "close" } });
  const body = await res.text();
  return { status: res.status, body };
}

beforeAll(async () => {
  // Configure the server module BEFORE it is imported (module-scope reads).
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "darius-nocot-probe-"));
  process.env.DB_PATH = path.join(tmpDir, "probe.db");
  process.env.DARIUS_DISABLE_LISTEN = "1"; // routes mounted, no listen, no plugin race
  delete process.env.DARIUS_API_TOKEN; // probe runs in localhost-legacy mode

  const mod = await import("../server.js");
  engineRef = mod.engine;

  const sentinelAgent: Agent = {
    id: "sentinel-probe-agent",
    name: "Sentinel Probe Agent",
    observe: async () => "observe summary",
    think: async () => `${SENTINEL} hidden multi-step reasoning chain`,
    act: async () => `DONE: ${PUBLIC_MARK} final curated report`,
  };
  engineRef.registerAgent(sentinelAgent);

  const task = engineRef.createTask("sentinel http probe", undefined, {
    successCriteria: PUBLIC_MARK,
  });
  const executed = await engineRef.executeTask(task.id, sentinelAgent.id);
  expect(executed.status).toBe("COMPLETED");

  await new Promise<void>((resolve) => {
    httpServer = mod.app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer?.close((err) => (err ? reject(err) : resolve()))
  );
  httpServer?.closeAllConnections?.();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("no-CoT HTTP sentinel probe (real express app)", () => {
  const surfaces = [
    "/api/health",
    "/api/dashboard",
    "/api/tasks",
    "/api/agents",
    "/api/agents/sentinel-probe-agent",
    "/api/memory",
    "/api/skills",
    "/api/logs",
  ];

  it("sentinel absent from every observability surface", async () => {
    for (const s of surfaces) {
      const { status, body } = await get(s);
      expect(status, `${s} status`).toBe(200);
      expect(body, `chain-of-thought leaked through ${s}`).not.toContain(SENTINEL);
    }
  });

  it("GET /api/tasks list exposes only public summaries (no metadata/executionHistory)", async () => {
    const { body } = await get("/api/tasks");
    const parsed = JSON.parse(body) as Array<Record<string, unknown>>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const t of parsed) {
      expect(t).not.toHaveProperty("metadata");
      expect(t).not.toHaveProperty("context");
      expect(t).toHaveProperty("id");
      expect(t).toHaveProperty("objective");
      expect(t).toHaveProperty("status");
    }
  });

  it("GET /api/tasks/:id trace redacts THINK but keeps the public result", async () => {
    const list = JSON.parse((await get("/api/tasks")).body) as Array<{ id: string; objective: string }>;
    const probeTask = list.find((t) => t.objective === "sentinel http probe");
    expect(probeTask).toBeDefined();

    const { body } = await get(`/api/tasks/${probeTask!.id}`);
    expect(body).not.toContain(SENTINEL); // no chain-of-thought
    expect(body).toContain(PUBLIC_MARK); // curated result/evidence stays public
    expect(body).toContain("(internal planning step — content not exposed)");

    const state = JSON.parse(body) as { trace: Array<{ state: string; output?: string }> };
    const thinkSteps = state.trace.filter((s) => s.state === "THINK");
    expect(thinkSteps.length).toBeGreaterThan(0);
    for (const s of thinkSteps) {
      expect(s.output).toBe("(internal planning step — content not exposed)");
    }
  });

  it("GET /api/agents/:id recentTasks are serialized public summaries", async () => {
    const { body } = await get("/api/agents/sentinel-probe-agent");
    const detail = JSON.parse(body) as { recentTasks: Array<Record<string, unknown>> };
    expect(detail.recentTasks.length).toBeGreaterThan(0);
    for (const t of detail.recentTasks) {
      expect(t).not.toHaveProperty("metadata");
      expect(t).not.toHaveProperty("context");
    }
  });
});
