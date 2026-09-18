import { useEffect, useState } from "react";
import { listTasks, createTask, getTaskState, apiError, type TaskSummary, type TaskState } from "../api";
import { Loading, Empty, ErrorState, StatusBadge } from "../components/StateViews";

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<TaskState | null>(null);

  const refresh = () =>
    listTasks()
      .then(setTasks)
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    refresh();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!objective.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createTask(objective.trim());
      setObjective("");
      await refresh();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setCreating(false);
    }
  }

  async function open(id: string) {
    setSelected(null);
    try {
      setSelected(await getTaskState(id));
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Describe an objective for DARIUS..."
          className="flex-1 bg-dark-800 border border-dark-700 rounded p-2 text-sm text-gray-200"
        />
        <button
          type="submit"
          disabled={creating || !objective.trim()}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded px-4 py-2 text-sm"
        >
          {creating ? "Creating..." : "Create task"}
        </button>
      </form>

      {error && <ErrorState message={error} />}

      {!tasks && <Loading label="Loading tasks..." />}
      {tasks && tasks.length === 0 && <Empty label="No tasks yet." />}

      {tasks && tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => open(t.id)}
                className="w-full text-left bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded p-3 text-sm flex items-center justify-between gap-3"
              >
                <span className="truncate">
                  <span className="text-gray-400">{t.id.slice(0, 8)}</span> — {t.objective}
                </span>
                <StatusBadge status={t.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <TaskTrace state={selected} />}
    </div>
  );
}

function TaskTrace({ state }: { state: TaskState }) {
  return (
    <section className="bg-dark-800 border border-dark-700 rounded p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-white font-semibold text-sm">
          {state.taskId.slice(0, 8)} — execution trace
        </h2>
        <StatusBadge status={state.status} />
      </div>
      <p className="text-sm text-gray-300">{state.objective}</p>
      <p className="text-xs text-gray-500">
        current state: {state.currentState} · iterations: {state.iterations}
      </p>
      {state.trace.length === 0 && <Empty label="No execution steps recorded yet." />}
      <ol className="space-y-2">
        {state.trace.map((step, i) => (
          <li key={i} className="text-sm border-l-2 border-dark-700 pl-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={step.state} />
              <span className="text-gray-500 text-xs">
                {step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : ""}
              </span>
            </div>
            {step.output && (
              <p className="text-gray-300 mt-1 break-words">{step.output.slice(0, 500)}</p>
            )}
            {step.error && <p className="text-red-300 mt-1 break-words">{step.error}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
