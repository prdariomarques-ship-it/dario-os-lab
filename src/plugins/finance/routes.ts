import { RouteRegistrarLike } from "../contract.js";
import { FinanceAnalysisWorkflow } from "./workflow.js";
import { FinanceTaskInput } from "./types.js";

/**
 * DARIUS Finance — HTTP routes (Phase 1: dashboard/analysis/approvals).
 *
 * Framework-free by design: the host adapts its HTTP framework (express,
 * fastify, node:http) to RouteRegistrarLike. This repository has NO express
 * dependency (see RC1 known limitation), so finance adds none.
 *
 * Exposed UI surface (section 15 of the product spec — no chain-of-thought):
 *  - POST /api/finance/analysis            → start analysis
 *  - GET  /api/finance/analysis/:taskId    → status (plan stage, result)
 *  - GET  /api/finance/analysis/:taskId/report → final report
 *  - POST /api/finance/analysis/:taskId/approve → human approval
 *  - POST /api/finance/analysis/:taskId/reject  → human rejection
 */

interface RequestLike {
  params?: Record<string, string>;
  body?: unknown;
}

function json(res: unknown, status: number, payload: unknown): void {
  (res as { writeHead(n: number, h: Record<string, string>): void; end(s: string): void }).writeHead(
    status,
    { "Content-Type": "application/json" }
  );
  (res as { end(s: string): void }).end(JSON.stringify(payload));
}

export function registerFinanceRoutes(
  registrar: RouteRegistrarLike,
  workflow: FinanceAnalysisWorkflow
): void {
  registrar.post("/api/finance/analysis", (req, res) => {
    try {
      const body = (req as RequestLike).body as FinanceTaskInput;
      const { taskId } = workflow.start(body, { startedBy: "api" });
      json(res, 201, { taskId, statusUrl: `/api/finance/analysis/${taskId}` });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  registrar.get("/api/finance/analysis/:taskId", (req, res) => {
    const taskId = (req as RequestLike).params?.taskId ?? "";
    const task = workflow.getStatus(taskId);
    if (!task) return json(res, 404, { error: "Not found" });
    // High-level view only: status + stage summary. Never model internals.
    json(res, 200, {
      taskId: task.id,
      status: task.status,
      taskType: task.metadata?.type,
      error: task.error,
      resultAvailable: !!task.result,
    });
  });

  registrar.get("/api/finance/analysis/:taskId/report", (req, res) => {
    const taskId = (req as RequestLike).params?.taskId ?? "";
    const report = workflow.getReport(taskId);
    if (!report) return json(res, 404, { error: "Report not available for this task" });
    json(res, 200, report);
  });

  registrar.post("/api/finance/analysis/:taskId/approve", (req, res) => {
    const taskId = (req as RequestLike).params?.taskId ?? "";
    const body = (req as RequestLike).body as { approver?: string; comment?: string };
    if (!body?.approver) return json(res, 400, { error: "approver is required" });
    workflow.approve(taskId, body.approver, body.comment).then(
      () => json(res, 200, { taskId, decision: "APPROVED" }),
      err => json(res, 409, { error: err instanceof Error ? err.message : String(err) })
    );
  });

  registrar.post("/api/finance/analysis/:taskId/reject", (req, res) => {
    const taskId = (req as RequestLike).params?.taskId ?? "";
    const body = (req as RequestLike).body as { approver?: string; reason?: string };
    if (!body?.approver || !body?.reason) {
      return json(res, 400, { error: "approver and reason are required" });
    }
    workflow.reject(taskId, body.approver, body.reason).then(
      () => json(res, 200, { taskId, decision: "REJECTED" }),
      err => json(res, 409, { error: err instanceof Error ? err.message : String(err) })
    );
  });
}
