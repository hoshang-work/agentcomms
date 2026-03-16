const intentColors: Record<string, string> = {
  REQUEST: "bg-blue-600",
  RESPONSE: "bg-green-600",
  BROADCAST: "bg-purple-600",
  ERROR: "bg-red-600",
  HEARTBEAT: "bg-gray-600",
};

export function IntentBadge({ intent }: { intent: string }) {
  const bg = intentColors[intent] ?? "bg-gray-600";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${bg}`}
    >
      {intent}
    </span>
  );
}
