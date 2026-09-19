/**
 * DARIUS OSS - Memory Subsystem Manager
 * Manages short-term conversational state and retrieves relevant long-term context for agent tasks.
 */

import { ChatMessage, Role } from '../types.ts';
import { MemoryEntry } from '../context/types.ts';
import {
  ConversationTurn,
  LongTermMemoryItem,
  MemoryCategory,
  MemoryManagerConfig,
  MemoryRetrievalOptions,
  MemorySearchResult,
  SerializedMemoryState,
  TaskContextMemory,
} from './types.ts';

const DEFAULT_CONFIG: Required<MemoryManagerConfig> = {
  maxShortTermMessages: 20,
  maxShortTermTokens: 4000,
  maxLongTermItems: 1000,
  autoCompact: true,
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
  'have', 'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
]);

export class MemoryManager {
  private config: Required<MemoryManagerConfig>;
  private shortTermHistory: ConversationTurn[] = [];
  private longTermStore: Map<string, LongTermMemoryItem> = new Map();

  constructor(config?: MemoryManagerConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  // =========================================================================
  // 1. Short-Term Conversational State Management
  // =========================================================================

  /**
   * Appends a message to short-term conversational state.
   */
  public addMessage(
    role: Role,
    content: string,
    metadata?: Record<string, unknown>
  ): ConversationTurn {
    const turn: ConversationTurn = {
      id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role,
      content,
      timestamp: Date.now(),
      tokens: this.estimateTokens(content),
      metadata,
    };

    this.shortTermHistory.push(turn);

    if (this.config.autoCompact) {
      this.compactShortTerm();
    }

    return turn;
  }

  /**
   * Retrieves short-term dialogue formatted as ChatMessage[] for model context.
   */
  public getRecentMessages(limit?: number): ChatMessage[] {
    const turns = limit ? this.shortTermHistory.slice(-limit) : this.shortTermHistory;
    return turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
  }

  /**
   * Returns complete short-term turn records with metadata and timestamps.
   */
  public getShortTermTurns(): ConversationTurn[] {
    return [...this.shortTermHistory];
  }

  /**
   * Returns current token usage of the short-term conversation buffer.
   */
  public estimateShortTermTokens(): number {
    return this.shortTermHistory.reduce((sum, turn) => sum + turn.tokens, 0);
  }

  /**
   * Clears the short-term conversational buffer.
   */
  public clearShortTerm(): void {
    this.shortTermHistory = [];
  }

  /**
   * Compacts short-term history when message count or token budget is exceeded.
   * Compresses older turns into an episodic summary while preserving recent dialogue.
   */
  public compactShortTerm(): void {
    const totalTokens = this.estimateShortTermTokens();
    const count = this.shortTermHistory.length;

    const needsCompaction =
      count > this.config.maxShortTermMessages ||
      totalTokens > this.config.maxShortTermTokens;

    if (!needsCompaction || this.shortTermHistory.length <= 4) {
      return;
    }

    // Keep the most recent 6 messages verbatim
    const preserveCount = Math.min(6, Math.floor(this.config.maxShortTermMessages / 2));
    const toArchive = this.shortTermHistory.slice(0, this.shortTermHistory.length - preserveCount);
    const toKeep = this.shortTermHistory.slice(this.shortTermHistory.length - preserveCount);

    if (toArchive.length > 0) {
      // Create an episodic summary turn from archived messages
      const summaryText = toArchive
        .map((t) => `${t.role}: ${t.content.slice(0, 120)}${t.content.length > 120 ? '...' : ''}`)
        .join(' | ');

      const summaryTurn: ConversationTurn = {
        id: `summary_${Date.now()}`,
        role: 'system',
        content: `[Previous conversation summary]: ${summaryText}`,
        timestamp: Date.now(),
        tokens: this.estimateTokens(summaryText) + 10,
        metadata: { isCompactedSummary: true, originalTurns: toArchive.length },
      };

      // Also automatically archive this summary into long-term memory for future reference
      this.addLongTermMemory({
        content: `Conversation summary: ${summaryText}`,
        category: 'episodic_summary',
        tags: ['auto_compact', 'session_history'],
        importance: 0.6,
        source: 'agent',
      });

      this.shortTermHistory = [summaryTurn, ...toKeep];
    }
  }

  // =========================================================================
  // 2. Long-Term Context & Knowledge Management
  // =========================================================================

  /**
   * Stores a fact, preference, or knowledge item into long-term context.
   */
  public addLongTermMemory(
    item: Omit<LongTermMemoryItem, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> & {
      id?: string;
    }
  ): LongTermMemoryItem {
    const id = item.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const fullItem: LongTermMemoryItem = {
      ...item,
      id,
      importance: Math.max(0, Math.min(1, item.importance ?? 0.5)),
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    };

    // Evict least important / least accessed item if store exceeds max capacity
    if (this.longTermStore.size >= this.config.maxLongTermItems) {
      this.evictLeastValuableMemory();
    }

    this.longTermStore.set(id, fullItem);
    return fullItem;
  }

  /**
   * Retrieves a single long-term memory item by ID.
   */
  public getLongTermMemory(id: string): LongTermMemoryItem | undefined {
    const item = this.longTermStore.get(id);
    if (item) {
      item.lastAccessedAt = Date.now();
      item.accessCount += 1;
    }
    return item;
  }

  /**
   * Updates an existing long-term memory record.
   */
  public updateLongTermMemory(
    id: string,
    updates: Partial<Omit<LongTermMemoryItem, 'id' | 'createdAt'>>
  ): LongTermMemoryItem | undefined {
    const existing = this.longTermStore.get(id);
    if (!existing) return undefined;

    const updated: LongTermMemoryItem = {
      ...existing,
      ...updates,
      lastAccessedAt: Date.now(),
    };

    this.longTermStore.set(id, updated);
    return updated;
  }

  /**
   * Deletes a long-term memory record by ID.
   */
  public deleteLongTermMemory(id: string): boolean {
    return this.longTermStore.delete(id);
  }

  /**
   * Lists all stored long-term memories with optional category or tag filter.
   */
  public listLongTermMemories(filter?: {
    category?: MemoryCategory;
    tag?: string;
  }): LongTermMemoryItem[] {
    const items = Array.from(this.longTermStore.values());
    return items.filter((item) => {
      if (filter?.category && item.category !== filter.category) return false;
      if (filter?.tag && !item.tags.includes(filter.tag)) return false;
      return true;
    });
  }

  /**
   * Clears all long-term memory records.
   */
  public clearLongTerm(): void {
    this.longTermStore.clear();
  }

  // =========================================================================
  // 3. Relevance Scoring & Retrieval Engine
  // =========================================================================

  /**
   * Retrieves the most relevant long-term context items matching an agent task or query.
   * Multi-criteria ranking combines lexical relevance, item importance, and recency decay.
   */
  public retrieveRelevant(
    query: string,
    options?: MemoryRetrievalOptions
  ): MemorySearchResult[] {
    const opts: Required<MemoryRetrievalOptions> = {
      limit: options?.limit ?? 5,
      minRelevance: options?.minRelevance ?? 0.25,
      categories: options?.categories ?? [],
      tags: options?.tags ?? [],
      maxTokens: options?.maxTokens ?? 2000,
      relevanceWeight: options?.relevanceWeight ?? 0.55,
      importanceWeight: options?.importanceWeight ?? 0.25,
      recencyWeight: options?.recencyWeight ?? 0.20,
    };

    const queryTerms = this.tokenize(query);
    const now = Date.now();
    const results: MemorySearchResult[] = [];

    for (const item of this.longTermStore.values()) {
      // Filter by category if specified
      if (opts.categories.length > 0 && !opts.categories.includes(item.category)) {
        continue;
      }

      // 1. Lexical Relevance (TF-IDF inspired + tag overlap)
      const relevanceScore = this.calculateRelevance(queryTerms, item, opts.tags);

      // 2. Recency Score (Exponential half-life decay, half-life = 7 days)
      const daysSinceAccess = Math.max(0, (now - item.lastAccessedAt) / (1000 * 60 * 60 * 24));
      const recencyScore = Math.exp(-0.1 * daysSinceAccess);

      // 3. Importance Score
      const importanceScore = item.importance;

      // Composite Normalized Score
      const compositeScore =
        opts.relevanceWeight * relevanceScore +
        opts.importanceWeight * importanceScore +
        opts.recencyWeight * recencyScore;

      if (compositeScore >= opts.minRelevance) {
        results.push({
          item,
          score: Math.round(compositeScore * 1000) / 1000,
          relevanceScore: Math.round(relevanceScore * 1000) / 1000,
          recencyScore: Math.round(recencyScore * 1000) / 1000,
          importanceScore: Math.round(importanceScore * 1000) / 1000,
        });
      }
    }

    // Sort descending by composite score
    results.sort((a, b) => b.score - a.score);

    // Apply token budget and limit constraints
    const budgetedResults: MemorySearchResult[] = [];
    let accumulatedTokens = 0;

    for (const res of results) {
      if (budgetedResults.length >= opts.limit) break;

      const itemTokens = this.estimateTokens(res.item.content);
      if (accumulatedTokens + itemTokens > opts.maxTokens && budgetedResults.length > 0) {
        continue;
      }

      // Mark accessed
      res.item.lastAccessedAt = now;
      res.item.accessCount += 1;

      budgetedResults.push(res);
      accumulatedTokens += itemTokens;
    }

    return budgetedResults;
  }

  /**
   * Retrieves relevant memories and converts them directly to ContextBuilder-compatible MemoryEntry[].
   */
  public retrieveRelevantAsEntries(
    query: string,
    options?: MemoryRetrievalOptions
  ): MemoryEntry[] {
    const results = this.retrieveRelevant(query, options);

    return results.map((r) => {
      let source: MemoryEntry['source'] = 'semantic_search';
      if (r.item.category === 'workspace_fact') source = 'workspace_kv';
      else if (r.item.category === 'user_preference') source = 'user_profile';
      else if (r.item.category === 'episodic_summary') source = 'short_term_buffer';

      return {
        id: r.item.id,
        source,
        content: `[${r.item.category.toUpperCase()}]: ${r.item.content}`,
        relevanceScore: r.score,
        timestamp: r.item.createdAt,
      };
    });
  }

  // =========================================================================
  // 4. Agent Task Context Assembly
  // =========================================================================

  /**
   * Produces both short-term conversational context and long-term relevant memory
   * structured for immediate dispatch into ContextBuilder or model execution.
   */
  public getContextForTask(
    taskGoal: string,
    options?: {
      maxTokens?: number;
      maxMemoryEntries?: number;
      shortTermLimit?: number;
    }
  ): TaskContextMemory {
    const maxTokens = options?.maxTokens ?? 3000;
    const maxMemoryTokens = Math.floor(maxTokens * 0.4);
    const shortTermLimit = options?.shortTermLimit ?? 10;

    const shortTermMessages = this.getRecentMessages(shortTermLimit);
    const relevantMemories = this.retrieveRelevantAsEntries(taskGoal, {
      limit: options?.maxMemoryEntries ?? 5,
      maxTokens: maxMemoryTokens,
    });

    const shortTermTokens = shortTermMessages.reduce(
      (acc, m) => acc + this.estimateTokens(m.content),
      0
    );
    const memoryTokens = relevantMemories.reduce(
      (acc, m) => acc + this.estimateTokens(m.content),
      0
    );

    return {
      shortTermMessages,
      relevantMemories,
      tokenEstimate: shortTermTokens + memoryTokens,
    };
  }

  // =========================================================================
  // 5. State Serialization & Persistence
  // =========================================================================

  /**
   * Exports full memory state for session persistence.
   */
  public exportState(): SerializedMemoryState {
    return {
      version: 1,
      shortTerm: [...this.shortTermHistory],
      longTerm: Array.from(this.longTermStore.values()),
      exportedAt: Date.now(),
    };
  }

  /**
   * Restores memory state from a serialized snapshot.
   */
  public importState(state: SerializedMemoryState): void {
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid memory state snapshot');
    }

    this.shortTermHistory = Array.isArray(state.shortTerm) ? [...state.shortTerm] : [];
    this.longTermStore = new Map();

    if (Array.isArray(state.longTerm)) {
      for (const item of state.longTerm) {
        if (item && item.id) {
          this.longTermStore.set(item.id, item);
        }
      }
    }
  }

  // =========================================================================
  // 6. Internal Utilities
  // =========================================================================

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  }

  private calculateRelevance(
    queryTerms: string[],
    item: LongTermMemoryItem,
    targetTags: string[]
  ): number {
    if (queryTerms.length === 0) return 0.5;

    const contentTerms = new Set(this.tokenize(item.content));
    const tagTerms = new Set(item.tags.map((t) => t.toLowerCase()));

    let matchedTerms = 0;
    for (const term of queryTerms) {
      if (contentTerms.has(term)) {
        matchedTerms += 1;
      } else if (tagTerms.has(term)) {
        matchedTerms += 1.2; // Bonus for tag match
      }
    }

    // Additional tag match boost if specific tags were queried
    let tagBoost = 0;
    if (targetTags.length > 0) {
      const matchingTags = targetTags.filter((t) => tagTerms.has(t.toLowerCase())).length;
      tagBoost = matchingTags / targetTags.length;
    }

    const termOverlap = Math.min(1.0, matchedTerms / queryTerms.length);
    return Math.min(1.0, termOverlap * 0.8 + tagBoost * 0.2);
  }

  private evictLeastValuableMemory(): void {
    let lowestScore = Infinity;
    let lowestId: string | null = null;
    const now = Date.now();

    for (const [id, item] of this.longTermStore.entries()) {
      const ageHours = (now - item.lastAccessedAt) / (1000 * 60 * 60);
      // Eviction score: items with high importance and recent access are kept
      const value = item.importance * 100 + item.accessCount * 10 - ageHours * 0.5;
      if (value < lowestScore) {
        lowestScore = value;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.longTermStore.delete(lowestId);
    }
  }

  private estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }
}
