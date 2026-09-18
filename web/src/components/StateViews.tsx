export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="p-6 text-gray-400 animate-pulse" role="status">
      {label}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <div className="p-6 text-gray-500 border border-dashed border-dark-700 rounded">
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6 text-red-300 bg-red-900/20 border border-red-800 rounded" role="alert">
      {message}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "COMPLETED" || status === "FINISHED"
      ? "bg-green-900/40 text-green-300"
      : status === "FAILED" || status === "ERROR"
        ? "bg-red-900/40 text-red-300"
        : status === "PAUSED" || status === "WAITING_APPROVAL" || status === "APPROVAL_REQUEST"
          ? "bg-yellow-900/40 text-yellow-200"
          : status === "CANCELLED"
            ? "bg-gray-800 text-gray-300"
            : "bg-blue-900/40 text-blue-200";
  return <span className={`px-2 py-0.5 rounded text-xs ${color}`}>{status}</span>;
}
