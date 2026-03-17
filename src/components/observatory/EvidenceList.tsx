import { useEffect, useState } from "react";
import { signalClient } from "../../data";
import type { Signal } from "../../types/signal";

interface EvidenceListProps {
  nodeId: string;
}

export default function EvidenceList({ nodeId }: EvidenceListProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    signalClient
      .getSignals({
        nodeId,
        status: "approved",
        orderBy: "impact_score",
        limit: 10,
      })
      .then(setSignals)
      .catch((err) => console.error("EvidenceList error:", err))
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (loading) {
    return (
      <div className="text-[10px] text-gray-600 py-2">Loading evidence...</div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="text-[10px] text-gray-600 py-2">
        No approved signals yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
        Evidence ({signals.length})
      </h4>
      {signals.map((s) => (
        <a
          key={s.id}
          href={s.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white/5 border border-white/10 rounded p-2 hover:bg-white/[0.08] transition-colors"
        >
          <div className="text-xs font-medium leading-snug mb-1">
            {s.title}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span>{s.source_name}</span>
            {s.published_date && (
              <span>{new Date(s.published_date).toLocaleDateString()}</span>
            )}
            <span className="ml-auto font-mono">
              {(s.impact_score * 100).toFixed(0)}%
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
