/**
 * DARIUS OSS - Full-Stack Express Server & AI Layer API
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import {
  GeminiProvider,
  MockProvider,
  ModelRouter,
  ContextBuilder,
  ReasoningEngine,
  AgentDecisionSchema,
  AgentEvaluator,
  EVALUATION_FIXTURES,
} from './src/ai/index.ts';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Providers
const geminiProvider = new GeminiProvider({
  modelId: 'gemini-3.8-flash',
});
const mockProvider = new MockProvider('darius-mock-v1');

const router = new ModelRouter([geminiProvider, mockProvider]);

// Helper to get active model based on query or header
function getModel(requestedId?: string) {
  if (requestedId === 'darius-mock-v1' || !process.env.GEMINI_API_KEY) {
    return mockProvider;
  }
  return geminiProvider;
}

// -------------------------------------------------------------
// AI LAYER API ROUTES
// -------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'DARIUS OSS AI & Reasoning Layer',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    activeModels: router.listModels(),
  });
});

app.get('/api/ai/models', (req, res) => {
  res.json({
    models: router.listModels(),
  });
});

app.get('/api/download-zip', (req, res) => {
  const zipPath = path.resolve(process.cwd(), 'darius-os-lab.zip');
  res.download(zipPath, 'darius-os-lab.zip', (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download zip file' });
    }
  });
});

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { input, options, modelId } = req.body;
    const model = getModel(modelId);
    const result = await model.generate(input, options);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If Gemini fails (e.g. quota limit), provide graceful diagnostic
    res.status(500).json({
      error: msg,
      fallbackSuggestion: 'You can test using the MockProvider to verify logic without API quota.',
    });
  }
});

app.post('/api/ai/stream', async (req, res) => {
  try {
    const { input, options, modelId } = req.body;
    const model = getModel(modelId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of model.stream(input, options)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

app.post('/api/ai/structured', async (req, res) => {
  try {
    const { input, schema, options, modelId } = req.body;
    const model = getModel(modelId);
    const result = await model.structuredOutput(input, schema || AgentDecisionSchema, options);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/reasoning/run', async (req, res) => {
  try {
    const { goal, context, tools, config, modelId } = req.body;
    const model = getModel(modelId);

    const builder = new ContextBuilder();
    builder.setTaskContext({
      goal,
      sessionId: `api_${Date.now()}`,
      constraints: context?.constraints || [],
      maxBudgetUsd: config?.maxCostUsd,
    });

    if (context?.memories) {
      builder.setMemories(context.memories);
    }
    if (context?.systemInstruction) {
      builder.setSystemInstruction(context.systemInstruction);
    }

    const engine = new ReasoningEngine(model, async (toolName, args) => {
      // Mock execution for demo tools
      if (toolName === 'web_search') {
        return { summary: `Simulated search results for: ${JSON.stringify(args)}` };
      }
      if (toolName === 'calculator') {
        return { result: 420 };
      }
      return { status: 'executed', tool: toolName, args };
    }, tools || []);

    const result = await engine.executeTask(goal, builder, config || { maxSteps: 5 });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/routing/evaluate', (req, res) => {
  try {
    const criteria = req.body;
    const decision = router.route(criteria);
    res.json(decision);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/evaluation/run', async (req, res) => {
  try {
    const { modelId, customCases } = req.body;
    const model = getModel(modelId);
    const evaluator = new AgentEvaluator(model);
    const report = await evaluator.runBenchmark(customCases || EVALUATION_FIXTURES);
    res.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// -------------------------------------------------------------
// VITE SPA MIDDLEWARE / STATIC ASSETS
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DARIUS OSS AI Layer Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal: Failed to start server', err);
  process.exit(1);
});
