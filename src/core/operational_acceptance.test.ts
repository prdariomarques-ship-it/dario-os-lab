import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SQLitePersistentStore } from "./sqlite.js";
import { TaskEngine } from "./engine.js";
import { AutonomousAgent } from "./agent.js";
import { SupervisorAgent } from "./multiagent.js";
import { SimpleContextEngine } from "../context/engine.js";
import { InMemoryMemoryStore } from "../memory/engine.js";
import { SimpleModelRouter } from "../model/router.js";
import { MockModelProvider } from "../model/engine.js";
import { SimpleToolEngine } from "../tools/engine.js";
import { DeterministicVerificationEngine } from "../verification/engine.js";
import { SimpleSkillEngine } from "../skills/engine.js";
import { SafeBrowserEngine, MockBrowserProvider } from "../browser/engine.js";
import { SQLiteArtifactStore } from "../artifacts/sqlite.js";
import { ArtifactEngine } from "../artifacts/engine.js";
import { ArtifactAwareVerifier } from "../verification/artifact_verifier.js";
import { SimpleTelemetryEmitter } from "../observability/engine.js";
import { DARIUSUIAdapter } from "../api/adapter.js";

import fsSync from "fs";

describe("Operational End-to-End Acceptance (Browser, Artifacts, Telemetry)", () => {
  const dbPath = "operational-e2e.db";

  afterEach(async () => {
    try { fsSync.unlinkSync(dbPath); } catch (e) {}
  });

  beforeEach(() => {
    try { fsSync.unlinkSync(dbPath); } catch (e) {}
  });

  it("Full autonomous web research, artifact generation, telemetry tracing, and verification", async () => {
    let store = new SQLitePersistentStore(dbPath);

    // Core Services
    let memory = new InMemoryMemoryStore();
    let contextEngine = new SimpleContextEngine(memory);
    let router = new SimpleModelRouter();

    // Operational Layers
    let artifactStore = new SQLiteArtifactStore(dbPath);
    let artifactEngine = new ArtifactEngine(artifactStore);

    let baseVerifier = new DeterministicVerificationEngine();
    let verifier = new ArtifactAwareVerifier(baseVerifier, artifactEngine);

    let telemetry = new SimpleTelemetryEmitter();

    let taskEngine = new TaskEngine(store, { maxIterations: 10, verifier } as any);

    // Tools
    let tools = new SimpleToolEngine();
    let browserEngine = new SafeBrowserEngine(new MockBrowserProvider());

    // Register Operational UI Adapter (to catch telemetry)
    let adapter = new DARIUSUIAdapter(taskEngine, memory, tools, telemetry);

    // Mock Provider mimicking intelligent Agent Workflow
    let navDone = false;
    let screenDone = false;
    const mockProvider = new MockModelProvider();
    mockProvider.generate = async (req) => {
      const isActPhase = req.temperature === 0.2 || req.context.fullPrompt.includes("action");
      if (!isActPhase) return { text: "Thinking...", finishReason: "stop", usage: {} as any };

      if (!navDone) {
        navDone = true;
        return { text: `TOOL_CALL: {"name": "navigate", "params": {"url": "https://example.com"}}`, finishReason: "stop", usage: {} as any };
      } else if (!screenDone) {
        screenDone = true;
        return { text: `TOOL_CALL: {"name": "screenshot", "params": {}}`, finishReason: "stop", usage: {} as any };
      } else {
        return { text: "DONE: Research completed", finishReason: "stop", usage: {} as any };
      }
    };
    router.registerProvider(mockProvider);

    tools.register({
      name: "navigate",
      description: "Navigates browser",
      risk: "LOW",
      schema: { url: "string" },
      execute: async (params, ctx) => {
         const res = await browserEngine.execute("navigate", params, ctx?.taskId || "t1");
         telemetry.emit({ taskId: ctx?.taskId || "t1", eventType: "TOOL_CALL", payload: { tool: "navigate", res } });
         return res;
      }
    });

    tools.register({
      name: "screenshot",
      description: "Takes screenshot",
      risk: "LOW",
      schema: {},
      execute: async (params) => {
         const buf = await browserEngine.execute("screenshot", params, task.id);
         artifactEngine.createArtifact(task.id, "e1", "SCREENSHOT", "web.png", "/tmp/web.png", buf.length);
         return "Screenshot saved";
      }
    });

    const agent = new AutonomousAgent("web_researcher", "Web Agent", contextEngine, router, tools);
    taskEngine.registerAgent(agent);

    // Create Task requiring a SCREENSHOT artifact
    const task = taskEngine.createTask("Research example.com", "Acceptance ctx", {
      requiredArtifactType: "SCREENSHOT"
    });

    const completed = await taskEngine.executeTask(task.id, "web_researcher");
    if (completed.status !== "COMPLETED") {
       console.log("Task Failed:", completed.error);
       const execs = store.getByTaskId(task.id);
       console.log("HISTORY:", execs[0].history.map(h => h.state + ": " + h.output));
    }

    // Verifications
    expect(completed.status).toBe("COMPLETED");

    // Verify artifacts exist
    const artifacts = artifactEngine.listArtifacts(task.id);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].type).toBe("SCREENSHOT");

    // Verify telemetry tracked events accurately in the Adapter
    const metrics = adapter.getDashboardMetrics();
    expect(metrics.recentActivities.length).toBeGreaterThan(0);
    const toolEvents = metrics.recentActivities.filter(a => a.eventType === "TOOL_CALL");
    expect(toolEvents.length).toBeGreaterThan(0);

    store.close();
    artifactStore.close();
  });
});
