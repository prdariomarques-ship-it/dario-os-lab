/**
 * DARIUS OSS - Memory Subsystem Types
 * Defines interfaces for short-term conversational state and long-term context retrieval
 */

import { ChatMessage, Role } from '../types.ts';
import { MemoryEntry } from '../context/types.ts';

export interface ConversationTurn {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  tokens: number;
  metadata?: Record<string, unknown>;
}

export type MemoryCategory =
  | 'user_preference'
  | 'domain_knowledge'
  | 'workspace_fact'
  | 'episodic_summary'
  | 'entity_profile'
  | 'tool_convention';

export interface LongTermMemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  tags: string[];
  importance: number; // 0.0 to 1.0 (default 0.5)
  source: 'user' | 'agent' | 'system' | 'tool' | 'document';
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryRetrievalOptions {
  /** Maximum number of long-term memories to return */
  limit?: number;
  /** Minimum composite score threshold (0.0 to 1.0) */
  minRelevance?: number;
  /** Filter by specific categories */
  categories?: MemoryCategory[];
  /** Filter or boost by specific tags */
  tags?: string[];
  /** Maximum total tokens allocated for retrieved memories */
  maxTokens?: number;
  /** Weight allocated to query term relevance (default: 0.55) */
  relevanceWeight?: number;
  /** Weight allocated to item importance (default: 0.25) */
  importanceWeight?: number;
  /** Weight allocated to recency (default: 0.20) */
  recencyWeight?: number;
}

export interface MemorySearchResult {
  item: LongTermMemoryItem;
  score: number;
  relevanceScore: number;
  recencyScore: number;
  importanceScore: number;
}

export interface MemoryManagerConfig {
  /** Maximum number of short-term conversational messages to retain */
  maxShortTermMessages?: number;
  /** Maximum token budget for short-term conversation */
  maxShortTermTokens?: number;
  /** Maximum number of long-term memory records to store */
  maxLongTermItems?: number;
  /** Whether to automatically prune/compact short-term turns when budget is exceeded */
  autoCompact?: boolean;
}

export interface TaskContextMemory {
  /** Formatted short-term conversational messages for model context */
  shortTermMessages: ChatMessage[];
  /** Retrieved relevant long-term memory entries formatted for ContextBuilder */
  relevantMemories: MemoryEntry[];
  /** Total estimated token footprint of the assembled memory */
  tokenEstimate: number;
}

export interface SerializedMemoryState {
  version: number;
  shortTerm: ConversationTurn[];
  longTerm: LongTermMemoryItem[];
  exportedAt: number;
}
