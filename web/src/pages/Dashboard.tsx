import { useEffect, useState } from "react";
import { getDashboard, type DashboardMetrics , apiError} from "../api";
import { Loading, Empty, ErrorState, StatusBadge } from "../components/StateViews";

export default function Dashboard() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <ErrorState message={`Failed to load dashboard: ${error}`} />;
  if (!data) return <Loading label="Loading dashboard..." />;
  if (!data.recentActivities || data.recentActivities.length === 0) {
    return <Empty label="No activity yet. Create a task or start a Finance analysis." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Agents" value={data.totalAgents} />
        <Metric label="Tasks active" value={data.tasks.active} />
        <Metric label="Completed" value={data.tasks.completed} />
        <Metric label="Failed" value={data.tasks.failed} />
      </div>
      <div className="text-sm text-gray-400">
        Runtime health: <StatusBadge status={data.health.status} />
      </div>
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Recent activity</h2>
        <ul className="space-y-2">
          {data.recentActivities.map((a) => (
            <li key={a.id} className="bg-dark-800 border border-dark-700 rounded p-3 text-sm flex items-center justify-between gap-3">
              <span className="truncate">
                <span className="text-gray-400">{a.taskId.slice(0, 8)}</span> — {a.eventType}
              </span>
              <StatusBadge status={a.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded p-4">
      <div className="text-2xl font-bold text-white">{value ?? "—"}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
