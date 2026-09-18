# DARIUS OSS — MASTER BUILD LOCAL DEPLOYMENT MANIFEST

Este manifesto detalha todos os arquivos estritos referentes a Master Build (Mobile, Web, API Server e Deployment Termux).
Por favor, copie e cole estes conteudos nos respectivos arquivos do seu repositorio local na branch principal.

---

## 1. DARIUS_TERMUX_DEPLOYMENT.md
**Path:** `DARIUS_TERMUX_DEPLOYMENT.md`
```markdown
# Termux Deployment
export DARIUS_HOST=0.0.0.0
export DARIUS_PORT=3000
npm install
npm run serve
```

---

## 2. SERVER ENTRYPOINT (Backend DARIUS API)
**Path:** `src/server.ts`
```typescript
import "dotenv/config";
import express from "express";
import cors from "cors";
import { TaskEngine } from "./core/engine.js";
import { SQLitePersistentStore } from "./core/sqlite.js";
import { AutonomousAgent } from "./core/agent.js";
import { SimpleContextEngine } from "./context/engine.js";
import { InMemoryMemoryStore } from "./memory/engine.js";
import { SimpleModelRouter } from "./model/router.js";
import { OllamaProvider } from "./model/ollama.js";
import { DeterministicVerificationEngine } from "./verification/engine.js";
import { DARIUSUIAdapter } from "./api/adapter.js";
import { randomUUID } from "node:crypto";
import { Task } from "./core/types.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

// Instanciar as dependencias do DARIUS Core globalmente
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

const dummyToolEngine: any = { listTools: () => [] };
const uiAdapter = new DARIUSUIAdapter(engine, memory, dummyToolEngine, undefined);

app.get("/api/health", (req, res) => res.json(uiAdapter.getDashboardMetrics().health));
app.get("/api/dashboard", (req, res) => res.json(uiAdapter.getDashboardMetrics()));
app.get("/api/tasks", (req, res) => res.json(store.listTasks()));
app.post("/api/tasks", async (req, res) => {
  const { objective, modelName } = req.body;
  if (!objective) return res.status(400).json({ error: "Missing objective" });
  const task: Task = { id: randomUUID(), objective, status: "PENDING", agentId: agent.id, metadata: { successCriteria: "Done", modelName: modelName || "nemotron-3.5-lightning:latest" }, createdAt: new Date(), updatedAt: new Date() };
  store.saveTask(task);
  engine.executeTask(task.id, agent.id).catch(err => console.error("Background execution error:", err));
  res.json(task);
});
app.get("/api/tasks/:id", (req, res) => {
  const state = uiAdapter.getTaskState(req.params.id);
  if (!state) return res.status(404).json({ error: "Not found" });
  res.json(state);
});
app.get("/api/agents", (req, res) => res.json(engine.getAgents()));
app.get("/api/agents/:id", (req, res) => {
  const detail = uiAdapter.getAgentDetails(req.params.id);
  if (!detail) return res.status(404).json({ error: "Not found" });
  res.json(detail);
});
app.get("/api/memory", async (req, res) => res.json(await uiAdapter.getMemoryManagerUIState()));
app.get("/api/skills", (req, res) => res.json(uiAdapter.getSkillsDirectory()));
app.get("/api/logs", (req, res) => res.json(uiAdapter.getDashboardMetrics().recentActivities || []));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DARIUS API Server is running on http://0.0.0.0:${PORT}`);
  console.log(`Configured Ollama URL: ${ollamaUrl}`);
});
```

---

## 3. TELEGRAM BOT
**Path:** `src/bot.ts`
```typescript
import "dotenv/config";
import { Bot, Context } from "grammy";
import { isAllowedChat } from "./access.js";

const token = process.env.TELEGRAM_TOKEN;
const allowedChatIdStr = process.env.TELEGRAM_CHAT_ID;
const allowedChatId = allowedChatIdStr ? Number(allowedChatIdStr) : undefined;

if (!token) {
  throw new Error("TELEGRAM_TOKEN não definido.");
}

const bot = new Bot(token);

function isAllowed(ctx: Context): boolean {
  return isAllowedChat(ctx.chat?.id, allowedChatId);
}

bot.use(async (ctx, next) => {
  if (!isAllowed(ctx)) {
    await ctx.reply("Acesso não autorizado.");
    return;
  }
  await next();
});

bot.command("start", async (ctx) => {
  await ctx.reply("Olá, Dario. Este é o gateway Telegram do DarioOS conectado ao Hermes.");
});

bot.command("help", async (ctx) => {
  await ctx.reply("/start — inicializa
/help — ajuda");
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (!text) return;

  await ctx.reply("⏳ Recebi sua mensagem. Criando Task no DARIUS OSS...");

  try {
    const response = await fetch("http://127.0.0.1:3000/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective: text })
    });

    if (!response.ok) {
      await ctx.reply("❌ Falha ao criar a Task na API.");
      return;
    }

    const data = await response.json();
    await ctx.reply(`✅ Task criada com sucesso!

ID: ${data.id}
Status: PENDING`);
  } catch (error) {
    await ctx.reply(`❌ O servidor local DARIUS (porta 3000) não está respondendo.`);
  }
});

bot.catch((error) => {
  console.error("Erro no bot Telegram:", error.error);
});

async function main(): Promise<void> {
  await bot.api.setMyCommands([
    { command: "start", description: "Inicializa a conversa" },
    { command: "help", description: "Mostra a ajuda" },
  ]);

  console.log("agente-dmn iniciado em modo polling.");
  await bot.start({
    onStart: (info) => console.log(`Bot conectado como @${info.username}`),
  });
}

void main().catch((error: unknown) => {
  console.error("Falha ao iniciar o agente-dmn:", error);
  process.exitCode = 1;
});
```

---

## 4. MOBILE APP (ANDROID EXPO)
Crie um diretório `mobile/`.

**Path:** `mobile/App.js`
```javascript
import React from 'react';
import { Text, View } from 'react-native';
export default function App() {
  return <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a'}}><Text style={{color: '#3b82f6'}}>DARIUS MOBILE</Text></View>;
}
```

**Path:** `mobile/package.json`
```json
{
  "name": "darius-mobile",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": { "serve": "expo start" },
  "dependencies": { "expo": "~51.0.8", "react": "18.2.0", "react-native": "0.74.1", "axios": "^1.6.0" }
}
```

---

## 5. WEB APP (STITCH UI REACT)
Crie um diretório `web/`.

**Path:** `web/package.json`
```json
{
  "name": "web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "lucide-react": "^0.439.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.3",
    "vite": "^5.4.1"
  }
}
```

**Path:** `web/vite.config.ts`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
})
```

**Path:** `web/tailwind.config.js`
```javascript
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

**Path:** `web/postcss.config.js`
```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

**Path:** `web/index.html`
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DARIUS Stitch UI</title>
  </head>
  <body class="bg-dark-900 text-gray-200">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Path:** `web/src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: #0a0a0a;
}
```

**Path:** `web/src/main.tsx`
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Path:** `web/src/App.tsx`
```typescript
import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

function Sidebar() {
  return (
    <div className="w-64 bg-dark-800 border-r border-dark-700 min-h-screen p-4 flex flex-col">
      <div className="text-xl font-bold text-white mb-8">DARIUS STITCH</div>
      <nav className="flex flex-col gap-2">
        <Link to="/" className="text-gray-300 hover:text-white p-2">Dashboard</Link>
        <Link to="/tasks" className="text-gray-300 hover:text-white p-2">Tasks</Link>
        <Link to="/agents" className="text-gray-300 hover:text-white p-2">Agents</Link>
      </nav>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="flex bg-dark-900 min-h-screen text-gray-200">
        <Sidebar />
        <main className="flex-1 p-8">
          <Routes>
            <Route path="/" element={<div>Dashboard</div>} />
            <Route path="/tasks" element={<div>Tasks</div>} />
            <Route path="/agents" element={<div>Agents</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
```
