const dotColors: Record<string, string> = {
  available: "bg-green-400",
  busy: "bg-yellow-400",
  offline: "bg-red-500",
};

export function StatusDot({ status }: { status: string }) {
  const color = dotColors[status] ?? "bg-gray-500";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
      title={status}
    />
  );
}
