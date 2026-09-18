import { useEffect, useState } from "react";
import { listSkills , apiError} from "../api";
import { Loading, Empty, ErrorState } from "../components/StateViews";

export default function Skills() {
  const [skills, setSkills] = useState<Array<{ id?: string; name?: string; description?: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <ErrorState message={`Failed to load skills: ${error}`} />;
  if (!skills) return <Loading label="Loading skills..." />;
  if (skills.length === 0) {
    return (
      <Empty label="No skills exposed by the server yet (Skills Engine is not connected to this endpoint in RC2)." />
    );
  }

  return (
    <ul className="space-y-2">
      {skills.map((s, i) => (
        <li key={s.id ?? i} className="bg-dark-800 border border-dark-700 rounded p-3 text-sm">
          <div className="text-white">{s.name ?? s.id}</div>
          {s.description && <div className="text-gray-400 text-xs mt-1">{s.description}</div>}
        </li>
      ))}
    </ul>
  );
}
