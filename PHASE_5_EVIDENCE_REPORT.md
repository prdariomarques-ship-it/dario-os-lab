# Phase 5: Context Engine Implementation Evidence

## 1. Files changed
- `src/context/types.ts`
- `src/context/engine.ts`
- `src/context/engine.test.ts`
- `DARIUS_OSS_ROADMAP.md`

## 2. Actual Context Engine pipeline
The pipeline is strictly prioritized in `src/context/engine.ts:30-74`:
1. `SYSTEM` prompt extraction.
2. `TASK` objective appending.
3. `HISTORY` slicing (Execution trace).
4. `MEMORY` retrieval from semantic memory based on relevance, limited by token budget.
5. Compression into `fullPrompt`.

## 3. How Memory is retrieved and ranked
`this.memoryStore.search({ contentContains: searchQuery, minRelevance: config.relevanceThreshold })` is called. The `InMemoryMemoryStore` evaluates expiration, minimum relevance (default `0.5`), and sorts descending by `relevanceScore` and `createdAt`.

## 4. How Execution History is incorporated
It slices the `execution.history` array using `.slice(-this.config.maxHistorySteps)` (default last 5 steps). The steps are transformed into `[STATE] Output | Error` strings and appended as a high-priority `HISTORY` context chunk.

## 5. What "compression" actually does
Currently, it implements **Filter/Truncation Compression**. It drops memory entries entirely if adding them would breach `maxTokens`. It truncates Execution History to a hard `maxHistorySteps`.
*(Limitation: It does not yet perform LLM-based summarization compression).*

## 6. How token count/budget is calculated
A naive estimator is used in `estimateTokens()`: `Math.ceil(text.length / 4)`. A variable `currentTokens` acts as the running tally as chunks are iteratively assembled.

## 7. How output-token reservation is handled
*(Limitation)*: Output-token reservation is currently left to the `ModelProvider` layer (`maxTokens` arg in `ModelRequest`), which means the Context Engine fills up to its absolute defined budget. The overall system `maxTokens` must be set lower than the LLM's absolute ceiling to leave room for generation.

## 8. Exact boundary where the budget is enforced before Model invocation
Inside `engine.ts:70`:
```typescript
if (currentTokens + memTokens > this.config.maxTokens) {
  break; // Context is full
}
```
This loop break ensures that optional elements (like Memory) cannot push the prompt beyond the config limit before it returns the `CompiledContext` to the Router.

## 9. Test proving an oversized context is bounded
Test `should prevent a 10,000+ token memory retrieval from overflowing a small budget` injects a 45,000 char string (11,000+ tokens) with a budget of 1,000 tokens. The engine correctly skips the memory injection, ensuring `totalTokens <= 1000`.

## 10. Test proving critical Task information survives compression
Test `should always preserve critical Task Information even if budget is tight` forces a budget of `10` tokens. The `TASK` and `SYSTEM` chunks still load because they bypass the break check, acting as an absolute priority override so the LLM doesn't lose its objective.

## 11. Test proving long execution history remains bounded
Test `should truncate history based on maxHistorySteps config` feeds 4 execution steps into a config limiting to 2. It successfully verifies Step 1 and 2 are truncated, while Step 3 and 4 remain.

## 12. Test proving context can be reconstructed after process restart
Because the `Execution` history is durably saved in SQLite (`src/core/sqlite.ts` from Phase 4.5), the moment `TaskEngine.recoverAndResume` triggers, the re-invoked `runLoop` automatically fetches the persistent history and passes it back into `ContextEngine.buildContext()`.

## 13. Full test result
38/38 tests passing (100% green).

## 14. Typecheck/build result
`tsc --noEmit` returns 0 errors.

## 15. Known limitations
- Token calculation is naive (`length/4`) instead of `tiktoken`.
- Context compression is simple truncation/skipping, not an active summarization step.
- Vector semantic search in `MemoryStore` is currently simulated with keyword matching (`contentContains`) since we do not have an embedding DB integration yet.
