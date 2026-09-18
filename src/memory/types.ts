export type MemoryType =
  | "SHORT_TERM" // Ephemeral, task-bound
  | "SESSION"    // Bound to a specific user/agent session
  | "EPISODIC"   // Records of past events/tasks
  | "SEMANTIC"   // Facts, knowledge, preferences
  | "PROCEDURAL" // How to do things (skills)
  | "LONG_TERM"; // Persistent, broad context

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  relevanceScore?: number; // 0 to 1
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface MemoryQuery {
  type?: MemoryType | MemoryType[];
  contentContains?: string;
  minRelevance?: number;
  metadataFilters?: Record<string, unknown>;
  limit?: number;
}

export interface MemoryStore {
  save(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<MemoryEntry>;
  get(id: string): Promise<MemoryEntry | undefined>;
  search(query: MemoryQuery): Promise<MemoryEntry[]>;
  update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | undefined>;
  delete(id: string): Promise<boolean>;
  cleanup(): Promise<number>; // Removes expired memories
}
