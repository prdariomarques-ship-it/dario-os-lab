# DARIUS OSS — RC1 MANIFEST

## VERSION/TAG
v0.1.0-rc.1

## COMMIT SHA
f833d43dfcda5b528524039ab61c8d457fe9db61

## ARCHITECTURE SUMMARY
DARIUS OSS is a local-first, modular Agent Operating System. The canonical TypeScript Core Runtime securely isolates Task objectives from Agent Executions, enforces strictly bounded Context mapping before Model generation, and rigorously evaluates physical verification constraints before completion.

## CAPABILITIES
- **Canonical Runtime**: TypeScript `TaskEngine` (Single authority)
- **Persistence Backend**: `better-sqlite3` (REAL)
- **Recovery Behavior**: Crash-survivable cross-process checkpoints (REAL)
- **Verification Model**: Deterministic constraints (e.g. `FILE_EXISTS`) via `ArtifactAwareVerifier` (REAL)
- **Retry Behavior**: Bounded iterative retries persisted safely (REAL)
- **Idempotency Model**: Action lock via safe metadata tracking during execution loops (REAL)
- **Security Boundaries**: Precondition checking, Tool Risk limitations, DOM/Navigation blocklists (REAL)
- **Browser Status**: `SafeBrowserEngine` (REAL), `MockBrowserProvider` (MOCK/TEST)
- **Artifact Status**: `ArtifactEngine` with `SQLiteArtifactStore` (REAL)
- **Observability Status**: `TelemetryEmitter` streaming structured events (REAL)
- **API/UI Status**: `DARIUSUIAdapter` mapping telemetry (REAL)
- **Telegram Status**: Independent parallel provider (REAL)
- **Skills**: `SimpleSkillEngine` with procedural execution (REAL)

## KNOWN LIMITATIONS & EXPERIMENTAL
- **External Web Providers**: Puppeteer/Playwright adapters for the `BrowserProvider` boundary remain pending.
- **LLM Bindings**: Real LLM querying (`src/model/ollama.ts`) runs cleanly but is isolated from local automated test coverage to prevent flakiness.
- **Semantic Vector Storage**: `MemoryStore` currently exists as an abstraction interface (`InMemoryMemoryStore`).
