# DARIUS OSS - Architecture Matrix Report

This matrix compares the target architecture defined in `DARIUS_OSS_ARCHITECTURE.md` against the real code implementation currently present in the repository, highlighting the "Architecture Drift" and defining exactly what is real, what is an interface, and what is merely roadmap.

```text
COMPONENT              CONTRACT    IMPLEMENTED    INTEGRATED    PERSISTENT    TESTED
────────────────────────────────────────────────────────────────────────────────────
Core                       ✓            ✓              ?            ✓           ✓
Task                       ✓            ✓              ?            ✓           ✓
Execution                  ✓            ✓              ?            ✓           ✓
State                      ✓            ✓              ?            ✓           ✓
Planner                    ✓            ✓              ?            ✓           ✓
Persistence                ✓            ✓              ?            ✓           ✓
Recovery                   ✓            ✓              ?            ✓           ✓
Memory                     ✓            ✓              ✓            parcial     ✓
Context                    ✓            ✓              ✓            ✓           ✓
Model                      ✓            ✓ (Router)     ✓            N/A         ✓
Tool                       ✓            ✓              ✓            N/A         ✓
MCP                        ✓            parcial        ?            N/A         ?
Skills                     ✓            ✓              ?            N/A         ✓
Verification               ✓            ✓              ✓            ✓           ✓
Security                   ✓            parcial        ?            —           ?
Observability              ✓            parcial        ?            ?           ✓
```

## Analysis of the Matrix
- **Core, Task, Execution, State, Planner, Persistence, Recovery**: These form the actual, proven **Persistent Agent Runtime**. They have strong interfaces, SQLite implementations, and pass strict unit testing including crash-survival simulations. However, their integration with the wider legacy systems (Telegram bot) is still pending ("?").
- **Memory**: The semantic Memory Engine exists with interfaces and an InMemory adapter (`src/memory`), but it is not yet backed by a true persistent DB (like the new SQLite core).
- **Context**: Interfaces exist, but no robust implementation is integrated yet.
- **Tools, Model, Security**: Tools have risk-level enforcement and HITL loops. However, the true LLM Model adapters are "partial" (legacy Python code might exist but isn't wired to the TS core).
- **Architecture Drift**: The Python/Hexagonal implementations (`darius/jobs`, `runtime/ollama.py`) mentioned in legacy PRs are currently disconnected from this TypeScript Core Runtime. We must converge the TS `TaskEngine` and the Python `LLMAdapters` into a unified execution flow.

## Recommended Next Phase
We must converge the Model Layer. We have a robust, crash-survivable TS Core Runtime, but no actual LLM binding natively integrated into this new `TaskEngine`. We should wire a real Model adapter into the `Agent.observe/think/act` pipeline before advancing to Context Engine or Skills.
