import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Agent } from "../core/types.js";

/**
 * Web <-> API contract smoke (Stitch UI integration audit).
 *
 * High-value smoke/integration assertions for the surfaces the Stitch web UI
 * consumes (web/src/api.ts), executed against the REAL express app from
 * src/server.ts (same wiring as production). Deliberately small: the UI has
 * no test runner of its own (documented limitation), so the HTTP boundary is
 * validated here instead.
 *
 * It also encodes the CURRENT HITL gap as executable evidence: generic-task
 * approve/reject/cancel do NOT exist over HTTP yet. When they are implemented
 * this file must be consciously updated (these assertions will fail) — that
 * failure is the contract review trigger, not a false positive.
 *
 * Note: DARIUS_DISABLE_LISTEN=1 keeps plugin mounting off, so Finance plugin
 * routes are NOT covered here (they are exercised by the live server smoke).
 */

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

async function send(
  method: "POST" | "GET",
  pathname: string,
  payload?: unknown
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { "content-type": "application/json", connection: "close" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await res.text();
  return { status: res.status, body };
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "darius-webcontract-"));
  process.env.DB_PATH = path.join(tmpDir, "probe.db");
  process.env.DARIUS_DISABLE_LISTEN = "1";
  delete process.env.DARIUS_API_TOKEN;

  const mod = await import("../server.js");
  engineRef = mod.engine;

  // Deterministic probe agent: keeps this file free of network/model
  // dependence (the default agent-cli-1 would attempt an Ollama call).
  const probe: Agent = {
    id: "webcontract-probe-agent",
    name: "Web Contract Probe Agent",
    observe: async () => "observe summary",
    think: async () => "plan the work",
    act: async () => "DONE: web contract probe report",
  };
  engineRef.registerAgent(probe);

  const task = engineRef.createTask("web contract probe objective", undefined, {
    successCriteria: "web contract probe report",
  });
  const executed = await engineRef.executeTask(task.id, probe.id);
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

describe("web <-> API contract smoke (real express app)", () => {
  it("GET /api/dashboard loads with the DashboardMetrics contract", async () => {
    const { status, body } = await get("/api/dashboard");
    expect(status).toBe(200);
    const m = JSON.parse(body) as Record<string, unknown>;
    expect(m).toHaveProperty("totalAgents");
    expect(typeof m.totalAgents).toBe("number");
    expect(m).toHaveProperty("tasks");
    const tasks = m.tasks as Record<string, unknown>;
    expect(tasks).toHaveProperty("active");
    expect(tasks).toHaveProperty("completed");
    expect(tasks).toHaveProperty("failed");
    expect(m).toHaveProperty("health");
    expect(m.health).toHaveProperty("status");
    expect(Array.isArray(m.recentActivities)).toBe(true);
  });

  it("GET /api/tasks loads and returns only public task summaries", async () => {
    const { status, body } = await get("/api/tasks");
    expect(status).toBe(200);
    const list = JSON.parse(body) as Array<Record<string, unknown>>;
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) {
      expect(t).toHaveProperty("id");
      expect(t).toHaveProperty("objective");
      expect(t).toHaveProperty("status");
      expect(t).not.toHaveProperty("metadata");
      expect(t).not.toHaveProperty("context");
    }
  });

  it("GET /api/tasks/:id trace steps carry only {state,timestamp,output?,error?}", async () => {
    const list = JSON.parse((await get("/api/tasks")).body) as Array<{
      id: string;
      objective: string;
    }>;
    const probeTask = list.find((t) => t.objective === "web contract probe objective");
    expect(probeTask).toBeDefined();

    const { status, body } = await get(`/api/tasks/${probeTask!.id}`);
    expect(status).toBe(200);
    const state = JSON.parse(body) as { trace: Array<Record<string, unknown>> };
    expect(state.trace.length).toBeGreaterThan(0);
    for (const step of state.trace) {
      for (const key of Object.keys(step)) {
        expect(["state", "timestamp", "output", "error"]).toContain(key);
      }
    }
    // no-CoT: no reasoning-bearing field ever appears in the trace contract
    expect(body.toLowerCase()).not.toContain("reasoning");
  });

  it("error state contract: unknown task and unknown agent return 404 JSON", async () => {
    const t = await get("/api/tasks/does-not-exist");
    expect(t.status).toBe(404);
    expect(JSON.parse(t.body)).toHaveProperty("error");

    const a = await get("/api/agents/does-not-exist");
    expect(a.status).toBe(404);
    expect(JSON.parse(a.body)).toHaveProperty("error");
  });

  it("POST /api/tasks contract: 400 without objective, public summary with it", async () => {
    const bad = await send("POST", "/api/tasks", {});
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.body)).toHaveProperty("error");

    const ok = await send("POST", "/api/tasks", { objective: "webcontract create smoke" });
    expect(ok.status).toBe(200);
    const created = JSON.parse(ok.body) as Record<string, unknown>;
    expect(created).toHaveProperty("id");
    expect(created).toHaveProperty("objective", "webcontract create smoke");
    expect(created).toHaveProperty("status");
    expect(created).not.toHaveProperty("metadata");
  });

  it("HITL GAP SENTINEL: generic-task approve/reject/cancel do NOT exist over HTTP (404)", async () => {
    // Documented gap (audit 2026-09): approval/rejection/cancellation for
    // generic tasks is engine-level only (resumeTask/rejectTask/cancelTask);
    // over HTTP only the Finance vertical exposes approve/reject today.
    // These 404s are the executable proof of that gap. If you add the
    // endpoints, update this test as part of the contract review.
    const list = JSON.parse((await get("/api/tasks")).body) as Array<{ id: string }>;
    const id = list[0].id;

    for (const action of ["approve", "reject", "cancel"]) {
      const r = await send("POST", `/api/tasks/${id}/${action}`, {});
      expect(r.status, `POST /api/tasks/:id/${action} must stay a conscious contract decision`).toBe(404);
    }
  });

  it("read surfaces consumed by the UI answer 200: agents, agent detail, memory, skills, logs", async () => {
    for (const s of ["/api/agents", "/api/memory", "/api/skills", "/api/logs"]) {
      const { status } = await get(s);
      expect(status, `${s} status`).toBe(200);
    }
    const { status } = await get("/api/agents/webcontract-probe-agent");
    expect(status).toBe(200);
  });
});
