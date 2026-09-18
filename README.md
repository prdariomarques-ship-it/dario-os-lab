# DARIUS OSS — AI Agent Runtime & Intelligence Layer

> **Provider-Agnostic Model Abstraction, Context Engineering, Memory Subsystem, Bounded Reasoning, Model Routing, and Evaluation Suite.**

---

## 🎯 Architecture Overview

DARIUS OSS AI Layer complements Jules (Core Runtime) and Antigravity (Engineering Architecture) with an autonomous, deterministic, and safe intelligence layer designed for production agents:

```
[ User / Task Goal ]
         │
         ▼
[ Memory Subsystem ] ── (Long-Term Multi-Criteria Retrieval + Short-Term Buffer)
         │
         ▼
[ Context Engineering ] ── (Tiered Layers: System, Task, Memory, Tools, History, Observations)
         │
         ▼
[ Model Router ] ── (Dynamic Heuristic & Cost Optimization)
         │
         ▼
[ Bounded Reasoning Loop ] ── (Structured Decision Schema, Max Steps Ceiling, Loop Breaker)
         │
         ▼
[ Output & Evaluation ] ── (8-Dimensional Benchmarking & Automated Scorer)
```

---

## 🏛️ The 6 Core Pillars

### 1. Model Abstraction Interface (`src/ai/types.ts`)
- Standardized contract:
  - `generate(context, options)`
  - `stream(context, options)`
  - `structuredOutput(context, schema, options)`
  - `capabilities()`
- Complete decoupling from provider SDKs. Hot-swappable providers:
  - `GeminiProvider` (powered by `@google/genai` TypeScript SDK)
  - `MockProvider` (offline testing, mock tooling, deterministic validation)

### 2. Context Engineering Layer (`src/ai/context/`)
- Strict multi-tier prompt composition:
  - **Layer 1: System Instructions** (Immutable safety and behavioral directives)
  - **Layer 2: Task Context** (Goal, strict constraints, session state)
  - **Layer 3: Relevant Memory** (Retrieved long-term knowledge & facts)
  - **Layer 4: Tool Definitions** (JSON schema specs of verified tools)
  - **Layer 5: Execution History** (Bounded thoughts, decisions, actions)
  - **Layer 6: Observations** (Tool outputs, metrics, system observations)
- Dynamic token budget allocator with non-destructive tiered trimming.

### 3. Memory Subsystem (`src/ai/memory/`)
- **Short-Term Conversational State**: Sliding window with token monitoring and automatic episodic compaction.
- **Long-Term Knowledge Store**: Categorized memory items (`workspace_fact`, `user_preference`, `domain_knowledge`, `episodic_summary`, `entity_profile`).
- **Multi-Criteria Retrieval Engine**:
  $$\text{Score} = (w_r \cdot \text{Relevance}) + (w_i \cdot \text{Importance}) + (w_t \cdot \text{Recency})$$

### 4. Bounded Reasoning Loop (`src/ai/reasoning/`)
- Deterministic decision-making adhering to strict step budgets (`maxSteps = 10`).
- Loop-breaker detecting repeated identical tool calls or cyclical deadlocks.
- Structured JSON Schema output (`AgentDecision`) evaluating state, confidence, and termination.

### 5. Dynamic Model Routing (`src/ai/routing/`)
- Complexity assessment evaluating task depth, tool count, and reasoning demands:
  - **Simple** $\rightarrow$ Fast / Low Cost (`gemini-2.5-flash-lite`)
  - **Standard** $\rightarrow$ Balanced Reasoning (`gemini-2.5-flash`)
  - **Complex** $\rightarrow$ Deep Analysis (`gemini-2.5-pro`)
- Cost and latency tracking with automated fallback cascades.

### 6. Automated Evaluation & Benchmarks (`src/ai/evaluation/`)
- Curated regression fixtures testing standard flows, tool failures, and prompt injection defense.
- Scored across 8 quantitative dimensions:
  - Task Success Rate
  - Tool Correctness
  - Hallucination Rate
  - Retry Count
  - Safety & Policy Adherence
  - End-to-End Latency
  - Token Efficiency
  - Execution Cost

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm or bun

### Installation
```bash
npm install
```

### Running Development Server
```bash
npm run dev
```
The application will be accessible on `http://localhost:3000`.

### Running Verification Tests
Execute the comprehensive verification test suite:
```bash
npx tsx src/ai/tests/run_tests.ts
```

### Production Build
```bash
npm run build
npm start
```

---

## ⌨️ Keyboard Shortcuts
- `Alt + 1`: Architecture Overview
- `Alt + 2`: Model Abstraction Playground
- `Alt + 3`: Context & Memory Engine
- `Alt + 4`: Bounded Reasoning Loop
- `Alt + 5`: Dynamic Model Router
- `Alt + 6`: Evaluation Suite & Benchmarks

---

## 📄 License
MIT License. Part of DARIUS OSS Ecosystem.
