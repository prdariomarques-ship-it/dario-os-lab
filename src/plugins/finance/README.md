# DARIUS Finance (vertical plugin)

> **DARIUS Finance is a vertical running on DARIUS OS.**
> It is NOT a new Core, NOT a second runtime, NOT a chatbot.

## Layout

```
src/plugins/finance/
├── plugin.ts          # FinancePlugin (DariusPlugin contract implementation)
├── types.ts           # domain types + FINANCE_PORTFOLIO_ANALYSIS task spec
├── policies.ts        # permission/risk policy + audited tool wrapper
├── workflow.ts        # FinanceAnalysisWorkflow (analysis + approval gate)
├── routes.ts          # framework-free HTTP routes
├── agents/
│   └── finance-agents.ts  # research, macro, portfolio, risk, tax, critic, orchestrator
├── skills/
│   └── index.ts       # market-research, macro, portfolio, risk, scenario, tax, critic, report
├── tools/
│   ├── providers.ts   # MarketDataProvider / EconomicDataProvider / PortfolioProvider (mock, Phase 1)
│   ├── calculator.ts  # deterministic metrics: weights, HHI, vol, drawdown, VaR
│   ├── simulation.ts  # deterministic scenario simulator
│   └── index.ts       # tool definitions (schema, risk, permission, timeout, audit)
└── verification/
    └── verifiers.ts   # custom verifiers enforced by the Core verification hook
```

## Usage (host wiring)

```ts
import { TaskEngine, InMemoryTaskStore } from "../../core/engine.js";
import { SimpleToolEngine } from "../../tools/engine.js";
import { SimpleSkillEngine } from "../../skills/engine.js";
import { InMemoryMemoryStore } from "../../memory/engine.js";
import { SimpleTelemetryEmitter } from "../../observability/engine.js";
import { DeterministicVerificationEngine } from "../../verification/engine.js";
import { PluginHost } from "../../plugins/host.js";
import { createFinancePlugin } from "./plugin.js";

const engine = new TaskEngine(new InMemoryTaskStore());
const toolEngine = new SimpleToolEngine();
const skillEngine = new SimpleSkillEngine();
const memory = new InMemoryMemoryStore();
const telemetry = new SimpleTelemetryEmitter();
const verifier = new DeterministicVerificationEngine();

const host = new PluginHost({ taskEngine: engine, toolEngine, skillEngine, memory, telemetry, verifier });
const finance = createFinancePlugin();
await host.apply(finance);

const { taskId } = finance.getWorkflow().start({
  portfolio: { baseCurrency: "BRL", holdings: [/* ... */] },
  riskProfile: { declaredTolerance: "MODERATE", constraints: [] },
});
// ... wait for PAUSED, then:
await finance.getWorkflow().approve(taskId, "dario");
```

## Hard rules

- Finance depends on DARIUS. DARIUS does NOT depend on Finance.
- No core file imports anything under `src/plugins/`.
- All Phase 1 tools are READ/LOW-MEDIUM; execution-class tools are forbidden.
- Hypothetical actions never execute. Approval only authorizes the proposal.
- Missing data is declared (`dataGaps`), never invented.
- Mock providers are always labeled (`isMock`, `MOCK_DEMO_DATA`).
