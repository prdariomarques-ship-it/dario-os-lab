# DARIUS OSS - Architecture

DARIUS OSS is an open-source infrastructure for building and executing autonomous AI agents. It is not a mere chatbot or LLM wrapper, but a full Agent Runtime / Operating System. The central principle is the **Task**, not the message.

## High-Level Target Architecture Map

```text
                 OBJECTIVE
                     ↓
                    TASK
                     ↓
                  PLANNER
                     ↓
                 EXECUTION
                     ↓
        ┌────────────┼────────────┐
        ↓            ↓            ↓
      MODEL        TOOLS       CONTEXT
        │            │
        │            ↓
        │           MCP
        │
        └────────────┐
                     ↓
                   STATE
                     ↓
                CHECKPOINT
                     ↓
               PERSISTENCE
                     ↓
                  RECOVERY
                     ↺
                  RESUME
                     ↓
                 VERIFY
                     ↓
                COMPLETE
```

## Conceptual Distinctions

For DARIUS to function as an OS rather than a simple script, the following concepts are kept strictly separate:

| Concept | Function |
|---|---|
| **Task** | The objective/work definition. |
| **Execution** | A specific runtime attempt/execution of a Task. |
| **State** | The current status/step of an Execution. |
| **Checkpoint** | A safe, durable point for resuming execution. |
| **Event** | An immutable record of what happened. |
| **Memory** | What the agent has learned/retained persistently. |
| **Context** | The selected information injected into a model invocation. |
| **Knowledge** | Available factual information. |
| **Skill** | How to execute a specific procedure. |
| **Artifact** | The produced output. |

## Transversal Concerns

```text
MEMORY
SECURITY & SANDBOX
VERIFICATION
OBSERVABILITY
```

## Core Components

### 1. DARIUS CORE & EXECUTION ENGINE
The operational center. It manages the `Observe -> Think -> Act` loop for an active `Execution` of a `Task`. It generates `Checkpoints` reflecting the `State`.

### 2. PERSISTENCE & RECOVERY
The bedrock of the Agent OS. Executions, Tasks, and Events are persisted (e.g., via SQLite) independently of the agent's semantic Memory. This layer allows DARIUS to load unfinished executions after a crash, inspect checkpoints, and resume safely, explicitly guarding against duplicated external side-effects (Idempotency).

### 3. PLANNER
Transforms an objective into a **Task Graph** allowing for parallel/sequential execution, dependencies, retries, and cycle detection.

### 4. CONTEXT ENGINE
Prevents context overflow via a pipeline: `Raw Context -> Relevance Filter -> Memory Retrieval -> Compression -> Task Context`.

### 5. MEMORY ENGINE
Separates persistent learned agent knowledge/experience from runtime execution state.

### 6. MODEL ROUTER
DARIUS is model-agnostic. Dynamically routes to Ollama, DeepSeek, Claude, etc.

### 7. TOOL ENGINE & MCP
Defines abstractions for tools (Schema, Permissions, Risk, Execution).

### 8. SKILL SYSTEM
Procedural knowledge structured and loaded on demand.

### 9. VERIFICATION & SECURITY
Explicitly validates outcomes and enforces Least Privilege, sandbox isolation, and Human-in-the-Loop (HITL) approval gates.


---

### EVIDENCE MODEL & VERIFICATION LAYER
**Authority:** The Agent/Model is never the authority that determines task completion. The authoritative chain is:
1. Agent proposes result (ACT).
2. Tools or system state produces physical/digital evidence.
3. VerificationEngine evaluates constraints against the evidence.
4. Core accepts (COMPLETED) or rejects (FAILED / RETRY).

**Evidence Model:**
Physical evidence includes verifiable, observable changes in the runtime environment:
- `FILE_EXISTS`: A file is physically present on the file system.
- `SCHEMA_MATCH`: Output strictly matches a required JSON schema/structure.
- `EXACT_TEXT`: The output string possesses exactly a predefined substring/signature.
- `CUSTOM`: Pluggable arbitrary verifications (HTTP status, database presence, etc.).

Verification cannot be bypassed. The TaskEngine strictly gates transition from `RUNNING` to `COMPLETED` via the `completeTaskWithVerification` step.
