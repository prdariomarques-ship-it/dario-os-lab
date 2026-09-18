import Database from "better-sqlite3";
import { Artifact, ArtifactStore } from "./types.js";

export class SQLiteArtifactStore implements ArtifactStore {
  private db: Database.Database;

  constructor(dbOrPath: Database.Database | string = ":memory:") {
    if (typeof dbOrPath === "string") {
      this.db = new Database(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        executionId TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        sizeBytes INTEGER,
        checksum TEXT,
        createdAt TEXT NOT NULL
      );
    `);
  }

  saveArtifact(artifact: Artifact): void {
    const stmt = this.db.prepare(`
      INSERT INTO artifacts (id, taskId, executionId, type, name, location, sizeBytes, checksum, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        location = excluded.location,
        sizeBytes = excluded.sizeBytes,
        checksum = excluded.checksum
    `);

    stmt.run(
      artifact.id,
      artifact.taskId,
      artifact.executionId,
      artifact.type,
      artifact.name,
      artifact.location,
      artifact.sizeBytes || null,
      artifact.checksum || null,
      artifact.createdAt.toISOString()
    );
  }

  getArtifact(id: string): Artifact | undefined {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  listByTaskId(taskId: string): Artifact[] {
    const rows = this.db.prepare("SELECT * FROM artifacts WHERE taskId = ? ORDER BY createdAt DESC").all(taskId) as any[];
    return rows.map(this.mapRow);
  }

  deleteArtifact(id: string): void {
    this.db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  }

  private mapRow(row: any): Artifact {
    return {
      id: row.id,
      taskId: row.taskId,
      executionId: row.executionId,
      type: row.type as any,
      name: row.name,
      location: row.location,
      sizeBytes: row.sizeBytes || undefined,
      checksum: row.checksum || undefined,
      createdAt: new Date(row.createdAt)
    };
  }

  close(): void {
    this.db.close();
  }
}
