# DARIUS FINANCE

> **DARIUS Finance is a vertical running on DARIUS OS.**

DARIUS Finance is NOT a new Core. It does NOT duplicate the Agent Runtime. It does
NOT turn DARIUS into a financial chatbot. It is the first business vertical proving
that DARIUS OS can turn a specialized knowledge domain into a system of agents that
is autonomous, modular, verifiable, observable, secure, multi-model, multi-agent,
human-in-the-loop and extensible.

---

## 1. Vision

Most wealth/investment services still depend on manual research, manual
consolidation, fragmented analysis, periodic follow-up and expensive human
processes. DARIUS Finance turns that flow into a continuous, verifiable,
supervised agent pipeline:

```
OBSERVE → UNDERSTAND → PLAN → DELEGATE → RESEARCH (parallel) → SYNTHESIZE
→ CRITIC → VERIFY → EXPLAIN → WAIT FOR APPROVAL → EXECUTE (only when authorized) → LEARN
```

Phase 1 MVP answers exactly one question:

**"Analise minha carteira e explique os principais riscos, oportunidades e cenários."**

## 2. Architecture

```
DARIUS OS
    ↓
DARIUS CORE / AGENT RUNTIME          (untouched: TaskEngine, Planner, Memory, Context, ModelRouter, ToolEngine, Verification)
    ↓
plugins/ contract (DariusPlugin)     (generic, domain-agnostic — NEW, lives beside Core, never imported by it)
    ↓
Finance Vertical (src/plugins/finance/)
    ├── agents/    research · macro · portfolio · risk · tax · critic · orchestrator
    ├── skills/    market-research · macro · portfolio-analysis · risk-analysis · scenario-analysis · tax · critic · report
    ├── tools/     market-data · economic-data · portfolio-data · calculator · simulator   (all READ-only, audited)
    ├── types/     domain types + FINANCE_PORTFOLIO_ANALYSIS task spec
    ├── policies   Phase 1 tool policy (READ/LOW-MEDIUM only), approval policy, audited wrapper
    ├── workflows  FinanceAnalysisWorkflow (graph + approval gate)
    └── verification  4 deterministic custom verifiers on the Core verification hook
    ↓
Providers (Phase 1: deterministic MOCK/local, explicitly labeled)
    ↓
Human Approval (Core-native WAITING_APPROVAL gate)
```

**Fundamental rule:** Finance depends on DARIUS. DARIUS does NOT depend on Finance.
If you remove `src/plugins/**`, DARIUS OS keeps working unchanged (asserted by tests).

### Plugin contract (minimal, generic)

`src/plugins/contract.ts` defines `DariusPlugin` + `PluginContext`:

- Runtime handles (call access, never replacement): `taskEngine`, `toolEngine`,
  `skillEngine`, `memory`, `telemetry`, `verifier?`
- Registration: `registerAgent`, `registerTool`, `registerSkill`,
  `registerCustomVerifier`, `registerObserver`, `registerRoutes?`

`src/plugins/host.ts` (`PluginHost.apply(plugin)`) wires a plugin onto a running
DARIUS runtime. No Core file imports the plugins layer. A future DARIUS Legal /
Insurance / Procurement vertical would reuse the same contract with zero Core changes.

## 3. Agents

All agents implement the **existing** `Agent` contract (observe → think → act,
terminating with `DONE:`) and are registered in the existing TaskEngine.
Phase 1 agents are deterministic and offline — no live LLM required.

| Agent | id | Responsibility |
|---|---|---|
| Finance Research Agent | `finance-research` | quotes, labeled evidence, data gaps |
| Macro Agent | `finance-macro` | rates, inflation, FX snapshot (labeled MOCK, no forecasts) |
| Portfolio Agent | `finance-portfolio` | allocation, concentration (HHI), hypothetical rebalancing |
| Risk Agent | `finance-risk` | volatility, drawdown, VaR approx + deterministic scenario suite |
| Tax Agent | `finance-tax` | only with declared cost data; P&L latente; no jurisdiction rules in MVP |
| Critic Agent | `finance-critic` | tries to invalidate premises, data, conclusions (real workflow stage) |
| Orchestrator | `finance-orchestrator` | drives the graph through the existing TaskEngine |

Optional LLM narrative: the orchestrator may call the **existing ModelRouter** with
capability `reasoning` to produce a short narrative. It is capability-based (never a
hardcoded provider), failures fall back silently, and the structured report never
depends on it. Chain-of-thought is never exposed anywhere.

## 4. Skills & Tools

Skills are procedures registered in the existing SkillEngine; they call tools
**only** through the existing ToolEngine (risk-gated, validated). Tools are
registered with: `name, description, schema, permission, risk, timeoutMs, audit,
validate, execute` — all five finance tools are **READ** / LOW-MEDIUM in Phase 1:

| Tool | Risk | Permission | Notes |
|---|---|---|---|
| `finance_market_data` | LOW | READ | mock provider, deterministic, labeled |
| `finance_economic_data` | LOW | READ | Selic/IPCA/FX demo values, labeled |
| `finance_portfolio_data` | LOW | READ | user-declared holdings only |
| `finance_calculator` | LOW | READ | weights, HHI, allocation, vol, drawdown, parametric VaR |
| `finance_scenario_simulator` | MEDIUM | READ | deterministic shocks (bear/rypto/rates/FX) |

Phase 1 policy **forbids** registering WRITE/EXECUTE/SENSITIVE tools
(`assertPhase1ToolPolicy`). Every execution emits a `TOOL_CALL` telemetry event
(tool, permission, risk, status, duration — no parameter dump, no chain-of-thought)
and enforces the declared timeout.

## 5. Workflow & Approval

`FINANCE_PORTFOLIO_ANALYSIS` is a real Task of the existing TaskEngine
(`Task.metadata` carries the full spec: objective, context, priority, dependencies,
tools, skills, agents, model capabilities, risk, budget, timeout, successCriteria,
verification criteria, retryPolicy, approvalPolicy, artifacts).

```
USER OBJECTIVE
  → root task (finance-orchestrator)
    → PARALLEL RESEARCH: market · macro · portfolio · risk(+scenarios) · tax   (child tasks via TaskEngine)
      → SYNTHESIZE (financial-report skill)
        → CRITIC (own child task, real stage)
          → REPORT draft
            → WAITING_APPROVAL   (engine.pauseForApproval — Core-native gate)
                APPROVED → proposals marked authorized (NO execution in Phase 1)
                REJECTED → engine.rejectTask → FAILED "REJECTED: <reason>"
```

The decision is recorded in the **existing MemoryStore** (never in code), and the
loop refuses to finalize without a recorded decision. Verification runs **before**
completion: the Core's verification hook enforces 4 finance custom verifiers:

| Verifier | Guarantees |
|---|---|
| `finance_report_schema` | result is a structurally complete report |
| `finance_math_consistency` | reported weights/HHI/top match recomputation from holdings |
| `finance_no_missing_data` | unpriced symbols declared as data gaps; confidence capped; mock usage disclosed |
| `finance_critic_gate` | critic stage ran; objections addressed |

## 6. Security

- least privilege (all tools READ; execution-class tools unregistered and forbidden)
- approval gates (Core-native pause/resume/reject; model output is never authorization)
- audit (TOOL_CALL telemetry; approval decisions in memory; full spec in task metadata)
- no credentials, no API keys, no live integrations declared as LIVE
- sandboxed by construction: Phase 1 touches nothing outside the process

## 7. Memory & Context

Finance stores, via the existing MemoryStore: user profile (SEMANTIC,
`source: "user-declared"`), analysis reports (EPISODIC, `source: "model-inference"`),
approval decisions (EPISODIC, `source: "user-declared"`), drafts (SHORT_TERM).
Secrets are never stored. The existing ContextEngine remains the only path from
memory/state to model calls; the portfolio is never dumped wholesale into every
agent — each research child receives only the declared input.

## 8. Models

No provider is hardcoded. The only optional model use (narrative) goes through the
existing ModelRouter with capability names (`research`, `reasoning`, `critic`),
compatible with Ollama/Gemini/OpenAI/Claude/DeepSeek/OpenRouter adapters. Phase 1
works fully offline; tests prove the router path with a capability-matched provider.

## 9. Testing

128 tests total (82 RC1 baseline + 46 new), all offline:

- plugin contract/host (registration, duplicate rejection, verifier wiring, routes)
- tools (determinism, no invented quotes, validation, timeouts, audit, policy)
- skills (evidence labeling, data gaps, P&L, critic objections, report consolidation)
- verification gates (schema, math tampering, missing data, critic, disclosure)
- **E2E**: start → parallel research → critic → report → WAITING_APPROVAL →
  approve → COMPLETED (verified report) · reject path · malformed input ·
  subtask failure propagation · memory records · audit trail
- **Core regression**: `src/core/engine.approval.test.ts` — the approval gate
  parks/resumes/rejects correctly while a loop is active (fails without the patch)

## 10. Required minimal Core patch (reviewed separately)

While integrating, a latent Core defect surfaced: `TaskEngine.runExecutionLoop`
keeps a local `Task` reference, while `TaskStore.saveTask` replaces the stored
object with a copy. `pauseForApproval/resumeTask/rejectTask` mutate the stored
copy, so an active loop never observes the transition and re-runs the agent
instead of parking. No RC1 test exercised `pauseForApproval` with an active loop.

The minimal fix (3 lines, `src/core/engine.ts`, marked `APPROVAL-GATE FIX`)
re-reads the authoritative status at the top of each iteration and is covered by
the new core regression tests. **Without this patch there is no real human
approval gate.** Review it as a core change, separate from the vertical.

## 11. Limitations (Phase 1)

- market/economic data is deterministic MOCK, always labeled — never real
- no background monitoring, no alerts, no broker integrations, no real execution
- tax analysis is qualitative unless cost data is declared; no jurisdiction rules
- parametric VaR is a gaussian approximation; synthetic series, not real history
- `MemoryStore` remains in-memory per runtime (RC1 limitation, unchanged)
- RC1 `src/server.ts` does not typecheck: it imports `express`/`cors` which are
  absent from `package.json` (pre-existing defect). Finance adds no HTTP framework
  dependency; `registerRoutes` uses a structural `RouteRegistrarLike` instead.

## 12. Roadmap

- **Fase 1 (done here)**: vertical, agents, skills, abstract tools, portfolio +
  risk analysis, critic, verification, approval model, tests, docs
- **Fase 2**: real market/economic providers, richer simulations, background
  monitoring, alerts
- **Fase 3**: broker integrations, authorized execution (SENSITIVE tools behind
  explicit approval design), advanced portfolio management

Not implemented in this phase on purpose: Fase 2/3 items.
