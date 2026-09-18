import { useEffect, useState } from "react";
import { getMemory, type MemoryState , apiError} from "../api";
import { Loading, Empty, ErrorState } from "../components/StateViews";

export default function Memory() {
  const [data, setData] = useState<MemoryState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMemory()
      .then(setData)
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <ErrorState message={`Failed to load memory: ${error}`} />;
  if (!data) return <Loading label="Loading memory..." />;
  if (data.recentEntries.length === 0) return <Empty label="Memory is empty." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-center">
        <Stat label="Short-term" value={data.stats.shortTermCount} />
        <Stat label="Session" value={data.stats.sessionCount} />
        <Stat label="Long-term" value={data.stats.longTermCount} />
      </div>
      <ul className="space-y-2">
        {data.recentEntries.map((e, i) => (
          <li key={e.id ?? i} className="bg-dark-800 border border-dark-700 rounded p-3 text-sm">
            <div className="text-gray-400 text-xs">{e.type ?? "ENTRY"}</div>
            <div className="text-gray-200 mt-1 break-words">{e.content?.slice(0, 400)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded p-3">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
