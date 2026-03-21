import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ReviewItemCard, type ReviewItem, type ReviewItemType } from "./ReviewItemCard";

interface Props {
  onSelectItem: (item: ReviewItem | null) => void;
  selectedId: string | null;
  /** Bulk selection support — parent manages selected IDs for bulk actions */
  bulkSelectedIds: Set<string>;
  onBulkToggle: (id: string) => void;
  onBulkSelectAll: (ids: string[]) => void;
  onBulkClear: () => void;
  /** Called whenever filtered items change, so parent can auto-select next item on action */
  onFilteredItemsChange?: (items: ReviewItem[]) => void;
}

const TYPE_FILTERS: { key: ReviewItemType; label: string }[] = [
  { key: "signal", label: "Signals" },
  { key: "discovery", label: "Discovery" },
  { key: "validation", label: "Validation" },
];

const STATUS_OPTIONS = ["pending", "all", "approved", "rejected"] as const;

export function UnifiedReviewList({
  onSelectItem,
  selectedId,
  bulkSelectedIds,
  onBulkToggle,
  onBulkSelectAll,
  onBulkClear,
  onFilteredItemsChange,
}: Props) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<ReviewItemType>>(
    new Set(["signal", "discovery", "validation"])
  );
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  // Subscribe to signals
  useEffect(() => {
    const signalsRef = collection(db, "signals");
    const q =
      statusFilter === "all"
        ? query(signalsRef, orderBy("fetched_at", "desc"))
        : query(
            signalsRef,
            where("status", "==", statusFilter),
            orderBy("fetched_at", "desc")
          );

    const unsub = onSnapshot(q, (snap) => {
      const signals: ReviewItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: "signal" as const,
          title: (data.title as string) ?? "",
          summary: (data.summary as string) ?? "",
          status: (data.status as string) ?? "pending",
          createdAt: data.fetched_at ?? null,
          signalType: data.signal_type as string,
          riskCategories: (data.risk_categories as string[]) ?? [],
          solutionIds: (data.solution_ids as string[]) ?? [],
          severityHint: data.severity_hint as string,
          confidenceScore: data.confidence_score as number,
          sourceName: data.source_name as string,
          sourceUrl: data.source_url as string,
          relatedNodeIds: (data.related_node_ids as string[]) ?? [],
        };
      });
      setItems((prev) => {
        const nonSignals = prev.filter((i) => i.type !== "signal");
        return [...nonSignals, ...signals];
      });
      setLoading(false);
    });

    return unsub;
  }, [statusFilter]);

  // Subscribe to discovery proposals (graph_proposals with proposal_type "new_node" or "new_edge")
  useEffect(() => {
    const proposalsRef = collection(db, "graph_proposals");
    const q =
      statusFilter === "all"
        ? query(proposalsRef, where("proposal_type", "in", ["new_node", "new_edge"]), orderBy("created_at", "desc"))
        : query(
            proposalsRef,
            where("proposal_type", "in", ["new_node", "new_edge"]),
            where("status", "==", statusFilter),
            orderBy("created_at", "desc")
          );

    const unsub = onSnapshot(q, (snap) => {
      const discoveries: ReviewItem[] = snap.docs.map((d) => {
        const data = d.data();
        if (data.proposal_type === "new_node") {
          return {
            id: d.id,
            type: "discovery" as const,
            title: (data.node_data?.name as string) ?? "New node proposal",
            summary: (data.node_data?.description as string) ?? "",
            status: (data.status as string) ?? "pending",
            createdAt: data.created_at ?? null,
            proposedName: data.node_data?.name as string,
            proposalType: data.proposal_type as string,
            skeleton: data.node_data as Record<string, unknown>,
            supportingSignalIds: (data.supporting_signal_ids as string[]) ?? [],
          };
        } else {
          // new_edge
          return {
            id: d.id,
            type: "discovery" as const,
            title: `${(data.edge_data?.from_node as string) ?? "?"} → ${(data.edge_data?.to_node as string) ?? "?"}`,
            summary: (data.edge_data?.reasoning as string) ?? "",
            status: (data.status as string) ?? "pending",
            createdAt: data.created_at ?? null,
            proposedName: "New Edge",
            proposalType: data.proposal_type as string,
            skeleton: data.edge_data as Record<string, unknown>,
            supportingSignalIds: (data.supporting_signal_ids as string[]) ?? [],
          };
        }
      });
      setItems((prev) => {
        const nonDiscovery = prev.filter((i) => i.type !== "discovery");
        return [...nonDiscovery, ...discoveries];
      });
    });

    return unsub;
  }, [statusFilter]);

  // Subscribe to validation proposals (graph_proposals with proposal_type "update_node")
  useEffect(() => {
    const proposalsRef = collection(db, "graph_proposals");
    const q =
      statusFilter === "all"
        ? query(proposalsRef, where("proposal_type", "==", "update_node"), orderBy("created_at", "desc"))
        : query(
            proposalsRef,
            where("proposal_type", "==", "update_node"),
            where("status", "==", statusFilter),
            orderBy("created_at", "desc")
          );

    const unsub = onSnapshot(q, (snap) => {
      const validations: ReviewItem[] = snap.docs.map((d) => {
        const data = d.data();
        const ud = data.update_data as Record<string, unknown> | undefined;
        return {
          id: d.id,
          type: "validation" as const,
          title: (ud?.node_name as string) ?? (ud?.node_id as string) ?? "Update proposal",
          summary: (ud?.overall_reasoning as string) ?? "",
          status: (data.status as string) ?? "pending",
          createdAt: data.created_at ?? null,
          documentType: ud?.node_type as string,
          documentId: ud?.node_id as string,
          documentName: ud?.node_name as string,
          proposedChanges: ud?.proposed_changes as Record<string, { current_value: unknown; proposed_value: unknown }>,
          overallReasoning: ud?.overall_reasoning as string,
          confidence: data.confidence as number,
        };
      });
      setItems((prev) => {
        const nonValidation = prev.filter((i) => i.type !== "validation");
        return [...nonValidation, ...validations];
      });
    });

    return unsub;
  }, [statusFilter]);

  // Filter and sort
  const filtered = useMemo(() => {
    return items
      .filter((item) => activeTypes.has(item.type))
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
  }, [items, activeTypes]);

  // Notify parent of filtered items for auto-selection
  useEffect(() => {
    onFilteredItemsChange?.(filtered);
  }, [filtered, onFilteredItemsChange]);

  const pendingCounts = useMemo(() => {
    const counts: Record<ReviewItemType, number> = { signal: 0, discovery: 0, validation: 0 };
    for (const item of items) {
      if (item.status === "pending") counts[item.type]++;
    }
    return counts;
  }, [items]);

  const toggleType = (type: ReviewItemType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-white/10">
        {/* Type toggles */}
        {TYPE_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleType(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeTypes.has(key)
                ? "bg-white/20 text-white"
                : "bg-white/5 text-white/40 hover:bg-white/10"
            }`}
          >
            {label}
            {pendingCounts[key] > 0 && (
              <span className="ml-1.5 bg-yellow-400/20 text-yellow-400 px-1.5 rounded-full">
                {pendingCounts[key]}
              </span>
            )}
          </button>
        ))}

        {/* Status filter */}
        <div className="ml-auto flex items-center gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider ${
                statusFilter === s
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkSelectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
          <span className="text-xs text-white/60">{bulkSelectedIds.size} selected</span>
          <button
            onClick={onBulkClear}
            className="text-xs text-white/40 hover:text-white/60"
          >
            Clear
          </button>
        </div>
      )}

      {/* Select all for current filter */}
      {filtered.length > 0 && statusFilter === "pending" && (
        <button
          onClick={() => onBulkSelectAll(filtered.map((i) => i.id))}
          className="text-[10px] text-white/40 hover:text-white/60 px-3 py-1"
        >
          Select all {filtered.length}
        </button>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-white/40 text-sm text-center py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">No items match filters</p>
        ) : (
          filtered.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex items-start gap-2">
              {statusFilter === "pending" && (
                <input
                  type="checkbox"
                  checked={bulkSelectedIds.has(item.id)}
                  onChange={() => onBulkToggle(item.id)}
                  className="mt-3 accent-blue-500"
                />
              )}
              <div className="flex-1">
                <ReviewItemCard
                  item={item}
                  selected={selectedId === item.id}
                  onClick={() => onSelectItem(item)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
