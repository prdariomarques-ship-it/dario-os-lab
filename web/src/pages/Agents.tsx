import { useEffect, useState } from "react";
import { listAgents, type AgentSummary , apiError} from "../api";
import { Loading, Empty, ErrorState } from "../components/StateViews";

export default function Agents() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentSummary | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <ErrorState message={`Failed to load agents: ${error}`} />;
  if (!agents) return <Loading label="Loading agents..." />;
  if (agents.length === 0) return <Empty label="No agents registered." />;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <ul className="space-y-2">
        {agents.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => setSelected(a)}
              className="w-full text-left bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded p-3 text-sm"
            >
              <div className="text-white">{a.name || a.id}</div>
              {a.description && <div className="text-gray-400 text-xs mt-1">{a.description}</div>}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <section className="bg-dark-800 border border-dark-700 rounded p-4 text-sm">
          <h2 className="text-white font-semibold">{selected.name || selected.id}</h2>
          <p className="text-gray-400 mt-2">{selected.description ?? "No description."}</p>
          <p className="text-gray-500 text-xs mt-4">id: {selected.id}</p>
        </section>
      )}
    </div>
  );
}
