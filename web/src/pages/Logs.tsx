import { useEffect, useState } from "react";
import { getLogs, type ExecutionLogEntry , apiError} from "../api";
import { Loading, Empty, ErrorState, StatusBadge } from "../components/StateViews";

export default function Logs() {
  const [logs, setLogs] = useState<ExecutionLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLogs()
      .then(setLogs)
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <ErrorState message={`Failed to load logs: ${error}`} />;
  if (!logs) return <Loading label="Loading logs..." />;
  if (logs.length === 0) return <Empty label="No log events recorded yet." />;

  return (
    <ul className="space-y-2">
      {logs.map((l) => (
        <li key={l.id} className="bg-dark-800 border border-dark-700 rounded p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-300">
              {l.eventType} · <span className="text-gray-500">{l.taskId.slice(0, 8)}</span>
            </span>
            <StatusBadge status={l.status} />
          </div>
          <div className="text-gray-500 text-xs mt-1">
            {l.timestamp ? new Date(l.timestamp).toLocaleString() : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
