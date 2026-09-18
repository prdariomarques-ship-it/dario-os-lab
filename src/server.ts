import "dotenv/config";
import express, { type RequestHandler } from "express";
import cors from "cors";
import { TaskEngine } from "./core/engine.js";
import { SQLitePersistentStore } from "./core/sqlite.js";
import { AutonomousAgent } from "./core/agent.js";
import { SimpleContextEngine } from "./context/engine.js";
import { InMemoryMemoryStore } from "./memory/engine.js";
import { SimpleModelRouter } from "./model/router.js";
import { OllamaProvider } from "./model/ollama.js";
import { DeterministicVerificationEngine } from "./verification/engine.js";
import { DARIUSUIAdapter, toPublicTaskSummary } from "./api/adapter.js";
import { SimpleToolEngine } from "./tools/engine.js";
import { SimpleSkillEngine } from "./skills/engine.js";
import { SimpleTelemetryEmitter } from "./observability/engine.js";
import { PluginHost } from "./plugins/host.js";
import type { RouteRegistrarLike } from "./plugins/contract.js";
import { createFinancePlugin } from "./plugins/finance/plugin.js";
import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import type { Task } from "./core/types.js";

// DARIUS Server is an INTERFACE/ADAPTER layer only:
//   HTTP API -> DARIUSUIAdapter -> TaskEngine (Core)
// No business logic lives here. The Telegram bot (src/bot.ts) is a sibling
// adapter over the same Core; this file does not create a second runtime.

const app = express();
app.use(express.json());

// CORS is restricted to an explicit allowlist (never "*").
// Configure with CORS_ORIGIN="https://ui.example.com,https://ui2.example.com".
// Defaults cover local development of the DARIUS web UI only.
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:4173,http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow-list only. Non-allowlisted browser origins receive no CORS
      // headers (browsers block them); non-browser tools without Origin
      // header (curl, mobile webview) pass through unaffected.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ["GET", "POST"],
    credentials: false,
  })
);

const PORT = Number(process.env.PORT) || 3000;

/**
 * Loopback-only bind classifier (RC2 security closure).
 *
 * A bind host is SAFE only when the listening socket cannot be reached from
 * another machine: IPv4 loopback (127.0.0.0/8), IPv6 ::1, or the literal
 * "localhost". Everything else (0.0.0.0, ::, wildcard shorthands, any
 * LAN/public address) exposes the API beyond this machine and therefore
 * REQUIRES DARIUS_API_TOKEN — the server refuses to boot otherwise
 * (fail-fast, deterministic, no behavior change for loopback setups and
 * for Termux/LAN deployments configured per DARIUS_TERMUX_DEPLOYMENT.md).
 */
export function isLoopbackBind(host: string): boolean {
  const h = (host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1") return true;
  if (h.startsWith("127.")) return true;
  return false;
}

// ---- Minimal API auth boundary (opt-in) ----
// Localhost-only deployments (default BIND_HOST=127.0.0.1) need no token:
// when DARIUS_API_TOKEN is unset the server behaves exactly as before.
// For LAN/Termux (BIND_HOST=0.0.0.0) set DARIUS_API_TOKEN; every /api route
// except the /api/health liveness probe then requires
//   Authorization: Bearer <token>   (or   x-darius-token: <token>).
// Clients without an Origin header (curl, mobile apps) pass the token as a
// header; browser-based UIs need their own token delivery mechanism, which
// is an architectural decision documented in DARIUS_HARDENING.md (pending).
// ENFORCEMENT (RC2): a non-loopback bind WITHOUT a token is refused at boot —
// an unauthenticated API on the LAN is not an acceptable silent default.
const apiToken = process.env.DARIUS_API_TOKEN?.trim() || "";
if (apiToken) {
  const expected = Buffer.from(apiToken, "utf8");
  app.use((req, res, next) => {
    if (req.path === "/api/health") return next(); // liveness probe stays open
    const bearer = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const xtoken = req.header("x-darius-token") ?? "";
    const header = bearer || xtoken;
    const provided = Buffer.from(header, "utf8");
    const ok =
      provided.length === expected.length && timingSafeEqual(provided, expected);
    if (!ok) {
      res.status(401).json({ error: "Unauthorized: missing or invalid API token" });
      return;
    }
    next();
  });
}

// 1. Instanciar as dependências do DARIUS Core globalmente
const dbPath = process.env.DB_PATH || "darius_live.db";
const store = new SQLitePersistentStore(dbPath);
const memory = new InMemoryMemoryStore();
const contextEngine = new SimpleContextEngine(memory);
const router = new SimpleModelRouter();

const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
router.registerProvider(new OllamaProvider(ollamaUrl));

const verifier = new DeterministicVerificationEngine();
const agent = new AutonomousAgent("agent-cli-1", "DARIUS_General_Agent", contextEngine, router);
const engine = new TaskEngine(store, { verifier }, undefined, undefined, memory, verifier);
engine.registerAgent(agent);

// Real host engines (plugins register into these; Core keeps owning them).
const toolEngine = new SimpleToolEngine(); // HIGH/CRITICAL risk gated off by default
const skillEngine = new SimpleSkillEngine();
const telemetry = new SimpleTelemetryEmitter();

const uiAdapter = new DARIUSUIAdapter(engine, memory, toolEngine, telemetry);

app.get("/api/health", (req, res) => {
  res.json(uiAdapter.getDashboardMetrics().health);
});
app.get("/api/dashboard", (req, res) => {
  res.json(uiAdapter.getDashboardMetrics());
});
app.get("/api/tasks", (req, res) => {
  // NO-CoT CONTRACT: raw store tasks carry metadata.executionHistory (raw
  // THINK reasoning). Only the public summary shape may cross the boundary.
  res.json(store.listTasks().map(toPublicTaskSummary));
});
app.post("/api/tasks", async (req, res) => {
  const { objective, modelName } = req.body as { objective?: string; modelName?: string };
  if (!objective) {
    res.status(400).json({ error: "Missing objective" });
    return;
  }
  const task: Task = {
    id: randomUUID(),
    objective,
    status: "PENDING",
    agentId: agent.id,
    metadata: { successCriteria: "Done", modelName: modelName || "nemotron-3.5-lightning:latest" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.saveTask(task);
  engine.executeTask(task.id, agent.id).catch((err: unknown) => console.error("Background execution error:", err));
  // Same public summary shape as GET /api/tasks — never the raw store task.
  res.json(toPublicTaskSummary(task));
});
app.get("/api/tasks/:id", (req, res) => {
  const state = uiAdapter.getTaskState(req.params.id);
  if (!state) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(state);
});
app.get("/api/agents", (req, res) => {
  // RC VALIDATION FIX: serialize only the public AgentSummary contract.
  // Raw AutonomousAgent instances hold contextEngine/modelRouter/workflow
  // references (finance agents reach deps.engine) — JSON.stringify hits a
  // circular structure (TaskEngine.observers -> UIAdapter -> taskEngine)
  // and the endpoint answered 500.
  res.json(engine.getAgents().map((a) => ({ id: a.id, name: a.name, description: a.description })));
});
app.get("/api/agents/:id", (req, res) => {
  const detail = uiAdapter.getAgentDetails(req.params.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);
});
app.get("/api/memory", async (req, res) => {
  res.json(await uiAdapter.getMemoryManagerUIState());
});
app.get("/api/skills", (req, res) => {
  res.json(uiAdapter.getSkillsDirectory());
});
app.get("/api/logs", (req, res) => {
  res.json(uiAdapter.getDashboardMetrics().recentActivities || []);
});

if (process.env.DARIUS_DISABLE_LISTEN !== "1") {
  // Bind to loopback by default; set BIND_HOST=0.0.0.0 explicitly when the
  // API must be reachable from other devices (e.g. Termux/mobile setup).
  const bindHost = process.env.BIND_HOST || "127.0.0.1";
  if (!isLoopbackBind(bindHost) && !apiToken) {
    console.error(
      `REFUSING TO START: BIND_HOST=${bindHost} exposes the API beyond this machine but DARIUS_API_TOKEN is not set. ` +
        `Set DARIUS_API_TOKEN (see DARIUS_TERMUX_DEPLOYMENT.md) or keep BIND_HOST=127.0.0.1.`
    );
    process.exit(1);
  }

  // ---- Vertical plugins (additive; Core never imports plugins) ----
  // Adapt express to the framework-free plugin route registrar.
  const registrar: RouteRegistrarLike = {
    get: (path: string, handler: (req: unknown, res: unknown) => void) =>
      app.get(path, handler as RequestHandler),
    post: (path: string, handler: (req: unknown, res: unknown) => void) =>
      app.post(path, handler as RequestHandler),
  };
  const host = new PluginHost({
    taskEngine: engine,
    toolEngine,
    skillEngine,
    memory,
    telemetry,
    verifier,
    routes: registrar,
  });

  const applyPlugins = host
    .apply(createFinancePlugin({ modelRouter: router }))
    .then(() => {
      console.log(
        `Plugins applied: ${host.listPlugins().map((p) => `${p.id}@${p.version}`).join(", ")}`
      );
    })
    .catch((err: unknown) => {
      // A failing vertical must never take the base OS down: keep serving
      // the Core API and report the plugin failure loudly.
      console.error("PLUGIN APPLICATION FAILED (Core API remains available):", err);
    });

  void applyPlugins.then(() => {
    app.listen(PORT, bindHost, () => {
      console.log(`DARIUS API Server is running on http://${bindHost}:${PORT}`);
      console.log(`CORS allowlist: ${allowedOrigins.join(", ")}`);
      console.log(`Configured Ollama URL: ${ollamaUrl}`);
    });
  });
}

// `engine` is exported for read-only observability probes (e.g. the no-CoT
// sentinel probe registers a probe agent and asserts no HTTP surface leaks
// internal reasoning). It grants no privileged mutation path beyond the
// engine's own public API.
export { app, engine };
