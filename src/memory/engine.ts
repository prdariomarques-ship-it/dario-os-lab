import { randomUUID } from "node:crypto";
import { MemoryEntry, MemoryQuery, MemoryStore } from "./types.js";

export class InMemoryMemoryStore implements MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();

  async save(entryData: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      ...entryData,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    const entry = this.entries.get(id);
    if (entry && entry.expiresAt && entry.expiresAt < new Date()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry;
  }

  async search(query: MemoryQuery): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const now = new Date();

    for (const entry of this.entries.values()) {
      // Check expiration
      if (entry.expiresAt && entry.expiresAt < now) {
        continue;
      }

      // Filter by type
      if (query.type) {
        const types = Array.isArray(query.type) ? query.type : [query.type];
        if (!types.includes(entry.type)) continue;
      }

      // Filter by content
      if (query.contentContains && !entry.content.includes(query.contentContains)) {
        continue;
      }

      // Filter by relevance
      if (query.minRelevance !== undefined && (entry.relevanceScore || 0) < query.minRelevance) {
        continue;
      }

      // Simple metadata exact match filtering
      if (query.metadataFilters) {
        let match = true;
        for (const [key, val] of Object.entries(query.metadataFilters)) {
          if (!entry.metadata || entry.metadata[key] !== val) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      results.push(entry);
    }

    // Sort by relevance (desc) then by createdAt (desc)
    results.sort((a, b) => {
      const relA = a.relevanceScore || 0;
      const relB = b.relevanceScore || 0;
      if (relA !== relB) return relB - relA;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    if (query.limit && query.limit > 0) {
      return results.slice(0, query.limit);
    }
    return results;
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | undefined> {
    const entry = await this.get(id); // Handles expiration check implicitly
    if (!entry) return undefined;

    const updatedEntry: MemoryEntry = {
      ...entry,
      ...updates,
      id: entry.id, // Ensure ID cannot be changed
      createdAt: entry.createdAt,
      updatedAt: new Date(),
    };
    this.entries.set(id, updatedEntry);
    return updatedEntry;
  }

  async delete(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;
    for (const [id, entry] of this.entries.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.entries.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }
}
