import Database from "better-sqlite3";
import { ExecutionStore, Task, TaskExecution, TaskStore } from "./types.js";

export class SQLitePersistentStore implements TaskStore, ExecutionStore {
  private db: Database.Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        context TEXT,
        result TEXT,
        error TEXT,
        agentId TEXT,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        agentId TEXT NOT NULL,
        state TEXT NOT NULL,
        iterations INTEGER NOT NULL,
        maxIterations INTEGER NOT NULL,
        history TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (taskId) REFERENCES tasks(id)
      );
    `);
  }

  // --- TaskStore Implementation ---

  saveTask(task: Task): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, objective, status, context, result, error, agentId, metadata, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        result = excluded.result,
        error = excluded.error,
        agentId = excluded.agentId,
        metadata = excluded.metadata,
        updatedAt = excluded.updatedAt
    `);

    stmt.run(
      task.id,
      task.objective,
      task.status,
      task.context || null,
      task.result || null,
      task.error || null,
      task.agentId || null,
      task.metadata ? JSON.stringify(task.metadata) : null,
      task.createdAt.toISOString(),
      task.updatedAt.toISOString()
    );
  }

  getTask(id: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!row) return undefined;
    return this.mapTask(row);
  }

  listTasks(): Task[] {
    const rows = this.db.prepare("SELECT * FROM tasks").all() as any[];
    return rows.map(this.mapTask);
  }

  deleteTask(id: string): boolean {
    const info = this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return info.changes > 0;
  }

  private mapTask(row: any): Task {
    return {
      id: row.id,
      objective: row.objective,
      status: row.status as any,
      context: row.context || undefined,
      result: row.result || undefined,
      error: row.error || undefined,
      agentId: row.agentId || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  // --- ExecutionStore Implementation ---

  saveExecution(execution: TaskExecution): void {
    const stmt = this.db.prepare(`
      INSERT INTO executions (id, taskId, agentId, state, iterations, maxIterations, history, startedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        state = excluded.state,
        iterations = excluded.iterations,
        history = excluded.history,
        updatedAt = excluded.updatedAt
    `);

    stmt.run(
      execution.id,
      execution.taskId,
      execution.agentId,
      execution.state,
      execution.iterations,
      execution.maxIterations,
      JSON.stringify(execution.history),
      execution.startedAt.toISOString(),
      execution.updatedAt.toISOString()
    );
  }

  getExecution(id: string): TaskExecution | undefined {
    const row = this.db.prepare("SELECT * FROM executions WHERE id = ?").get(id) as any;
    if (!row) return undefined;
    return this.mapExecution(row);
  }

  getByTaskId(taskId: string): TaskExecution[] {
    const rows = this.db.prepare("SELECT * FROM executions WHERE taskId = ? ORDER BY startedAt DESC").all(taskId) as any[];
    return rows.map(this.mapExecution);
  }

  private mapExecution(row: any): TaskExecution {
    return {
      id: row.id,
      taskId: row.taskId,
      agentId: row.agentId,
      state: row.state as any,
      iterations: row.iterations,
      maxIterations: row.maxIterations,
      history: JSON.parse(row.history),
      startedAt: new Date(row.startedAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  close(): void {
    this.db.close();
  }
}
