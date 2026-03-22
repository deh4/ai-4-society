export default function HarmStatusBadge({ status }: { status: "incident" | "hazard" | null | undefined }) {
  if (!status) return null;

  const styles: Record<"incident" | "hazard", string> = {
    incident: "bg-red-500/15 text-red-400 border-red-500/30",
    hazard: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };

  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${styles[status]}`}>
      {status}
    </span>
  );
}
