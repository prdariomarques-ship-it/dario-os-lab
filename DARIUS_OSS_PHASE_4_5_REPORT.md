# DARIUS OSS - Phase 4.5 Persistence & Recovery Report

## 1. What was inspected
- The `src/core/engine.ts` execution loop, state tracking, and storage interfaces.
- The `src/core/types.ts` representation of Task vs Execution.

## 2. What persistence existed before
- Only an `InMemoryTaskStore`.
- No separated execution identities; execution history was merely an array attached directly to the Task metadata in RAM.

## 3. What architectural gap was found
- Process death during an active loop (OBSERVE -> THINK -> ACT) would completely erase the execution state, meaning DARIUS was only a stateless/in-memory session framework and not a true resilient Agent OS.
- Missing explicit separation of `Task` (the objective) and `TaskExecution` (the running attempt).

## 4. Files changed
- `src/core/types.ts`
- `src/core/engine.ts`
- `src/core/sqlite.ts` (NEW)
- `src/core/persistence.test.ts` (NEW)
- `DARIUS_OSS_ROADMAP.md`

## 5. New interfaces/adapters
- `ExecutionStore`: Exclusively stores instances of `TaskExecution`.
- `SQLitePersistentStore`: A `better-sqlite3` implementation acting as both `TaskStore` and `ExecutionStore`.

## 6. Database/storage choice
- `better-sqlite3` as the local, synchronous MVP storage engine. It provides ACID guarantees for the durable checkpoints without requiring external infrastructure (like Postgres or Redis).

## 7. Recovery mechanism
- Implemented `TaskEngine.recoverAndResume(taskId)`: It fetches the task from the store, fetches the latest execution from the execution store, checks for ambiguous crash states, and then resumes the `runLoop()` from where it left off.

## 8. Checkpoint mechanism
- The `TaskEngine` execution loop now explicitly triggers `this.execStore.saveExecution(execution)` after every single state transition step (`OBSERVE`, `THINK`, `ACT`, `WAITING_APPROVAL`).

## 9. Idempotency/side-effect strategy
- If the system crashes during the `ACT` phase (before it can transition to `DONE`), `recoverAndResume` will intercept it and throw a safe "CRASH RECOVERY: Ambiguous state interrupted during ACT" failure. This explicitly prevents blind re-execution of a tool call that may have already triggered a real-world side effect.

## 10. Crash/restart tests
- Simulated crashing immediately after `WAITING_APPROVAL` (Scenario D).
- Simulated crashing during `ACT` (Scenario C / Idempotency protection).

## 11. Full test result
- 29 tests passing. 100% success.

## 12. Typecheck/build result
- `tsc --noEmit` passes with 0 errors.

## 13. Remaining risks
- Deep idempotency keys for external tools aren't built into the ToolEngine yet. We currently protect against crashes during `ACT`, but tool-level deduplication requires more granular design later.

## 14. Recommended next phase
- **Phase 5: Context Engine**. Now that the system is durable, we can manage the context limits and semantic memory bindings to the LLM safely.
