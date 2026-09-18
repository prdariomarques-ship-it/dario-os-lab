import { useState } from "react";
import {
  apiError,
  startFinanceAnalysis,
  getFinanceStatus,
  getFinanceReport,
  approveFinance,
  rejectFinance,
  type FinanceStatus,
} from "../api";
import { Empty, ErrorState, StatusBadge, Loading } from "../components/StateViews";

/**
 * DARIUS Finance — minimal Phase 1 surface (portfolio risk analysis with
 * human-in-the-loop approval). Talks ONLY to the mounted plugin routes.
 */
export default function Finance() {
  const [symbols, setSymbols] = useState("PETR4, VALE3, HGLG11");
  const [tolerance, setTolerance] = useState<"CONSERVATIVE" | "MODERATE" | "AGGRESSIVE">("MODERATE");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<FinanceStatus | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    setStatus(null);
    try {
      const holdings = symbols
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((symbol) => ({ symbol, quantity: 1 }));
      const { taskId } = await startFinanceAnalysis({
        portfolio: { baseCurrency: "BRL", holdings },
        riskProfile: { declaredTolerance: tolerance },
      });
      setTaskId(taskId);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function poll() {
    if (!taskId) return;
    setBusy(true);
    setError(null);
    try {
      const s = await getFinanceStatus(taskId);
      setStatus(s);
      if (s.resultAvailable) {
        setReport(await getFinanceReport(taskId));
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function decide(kind: "approve" | "reject") {
    const id = taskId;
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const approver = "web-operator";
      if (kind === "approve") await approveFinance(id, approver);
      else await rejectFinance(id, approver, "declined in web UI");
      await poll();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={start} className="bg-dark-800 border border-dark-700 rounded p-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Holdings (symbols, comma-separated — mock data provider)</label>
          <input
            value={symbols}
            onChange={(e) => setSymbols(e.target.value)}
            className="w-full bg-dark-900 border border-dark-700 rounded p-2 text-sm text-gray-200"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Declared risk tolerance</label>
          <select
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value as typeof tolerance)}
            className="w-full bg-dark-900 border border-dark-700 rounded p-2 text-sm text-gray-200"
          >
            <option value="CONSERVATIVE">CONSERVATIVE</option>
            <option value="MODERATE">MODERATE</option>
            <option value="AGGRESSIVE">AGGRESSIVE</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !symbols.trim()}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded px-4 py-2 text-sm"
        >
          {busy ? "Working..." : "Start analysis"}
        </button>
      </form>

      {error && <ErrorState message={error} />}

      {taskId && !status && <Loading label="Analysis started — polling status..." />}
      {status && (
        <section className="bg-dark-800 border border-dark-700 rounded p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-white text-sm font-semibold">Analysis {taskId?.slice(0, 8)}</h2>
            <StatusBadge status={status.status} />
          </div>
          {status.error && <p className="text-red-300 text-sm">{status.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={poll} disabled={busy} className="bg-dark-700 hover:bg-dark-600 text-gray-200 rounded px-3 py-1.5 text-xs">
              Refresh status
            </button>
            {status.status === "PAUSED" && (
              <>
                <button onClick={() => decide("approve")} disabled={busy} className="bg-green-800 hover:bg-green-700 text-white rounded px-3 py-1.5 text-xs">
                  Approve
                </button>
                <button onClick={() => decide("reject")} disabled={busy} className="bg-red-800 hover:bg-red-700 text-white rounded px-3 py-1.5 text-xs">
                  Reject
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {report && (
        <section className="bg-dark-800 border border-dark-700 rounded p-4">
          <h2 className="text-white text-sm font-semibold mb-2">Verified report</h2>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words">
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>
      )}

      {!taskId && <Empty label="Start an analysis to see the workflow (research → critique → report → approval)." />}
    </div>
  );
}
