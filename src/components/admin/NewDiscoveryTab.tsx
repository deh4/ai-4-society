import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../store/AuthContext";
import { useGraph } from "../../store/GraphContext";
import { useProposalActions } from "../../hooks/useProposalActions";
import { assignItem, unassignItem } from "../../data/assignments";
import { AdminNotesInput } from "./AdminNotesInput";
import { BulkActionBar } from "./BulkActionBar";
import { AssigneeDropdown } from "./AssigneeDropdown";
import type { DiscoveryItem, SignalQualityMeta } from "../../types/review";

const STATUS_OPTIONS = ["pending", "all", "approved", "rejected"] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewDiscoveryTab() {
  const { user } = useAuth();
  const { snapshot } = useGraph();
  const {
    handleProposalApprove, handleProposalReject,
    handleBulkProposalApprove, handleBulkProposalReject, updating,
  } = useProposalActions();

  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedItem, setSelectedItem] = useState<DiscoveryItem | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  // Signal title map for resolving supporting signal IDs
  const [signalTitleMap, setSignalTitleMap] = useState<Map<string, string>>(new Map());

  // Subscribe to discovery proposals
  useEffect(() => {
    const proposalsRef = collection(db, "graph_proposals");
    const constraints = [
      where("proposal_type", "in", ["new_node", "new_edge"]),
      ...(statusFilter !== "all" ? [where("status", "==", statusFilter)] : []),
      orderBy("created_at", "desc"),
    ];
    const q = query(proposalsRef, ...constraints);

    const unsub = onSnapshot(q, (snap) => {
      const discoveries: DiscoveryItem[] = snap.docs.map((d) => {
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
            skeleton: (data.node_data as Record<string, unknown>) ?? {},
            supportingSignalIds: (data.supporting_signal_ids as string[]) ?? [],
            confidence: data.confidence as number,
            signalQuality: data.signal_quality as SignalQualityMeta | undefined,
            assigned_to: data.assigned_to as string | undefined,
            assigned_by: data.assigned_by as string | undefined,
          };
        }
        const fromId = (data.edge_data?.from_node as string) ?? "?";
        const toId = (data.edge_data?.to_node as string) ?? "?";
        return {
          id: d.id,
          type: "discovery" as const,
          title: `${fromId} → ${toId}`,
          summary: (data.edge_data?.reasoning as string) ?? "",
          status: (data.status as string) ?? "pending",
          createdAt: data.created_at ?? null,
          proposedName: "New Edge",
          proposalType: data.proposal_type as string,
          skeleton: (data.edge_data as Record<string, unknown>) ?? {},
          supportingSignalIds: (data.supporting_signal_ids as string[]) ?? [],
          confidence: data.confidence as number,
          signalQuality: data.signal_quality as SignalQualityMeta | undefined,
          assigned_to: data.assigned_to as string | undefined,
          assigned_by: data.assigned_by as string | undefined,
        };
      });
      setItems(discoveries);
      setLoading(false);
    });
    return unsub;
  }, [statusFilter]);

  // Also subscribe to recent signals to build title map
  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const q = query(
      collection(db, "signals"),
      where("fetched_at", ">", cutoff),
      orderBy("fetched_at", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const map = new Map<string, string>();
      for (const d of snap.docs) {
        map.set(d.id, (d.data().title as string) ?? d.id);
      }
      setSignalTitleMap(map);
    });
    return unsub;
  }, []);

  // Resolve edge node names
  const resolvedItems = useMemo(() => {
    return items.map((item) => {
      if (item.proposalType === "new_edge" && item.title.includes(" → ") && snapshot) {
        const [fromId, toId] = item.title.split(" → ");
        const fromNode = snapshot.nodes.find((n) => n.id === fromId);
        const toNode = snapshot.nodes.find((n) => n.id === toId);
        return {
          ...item,
          title: `${fromNode?.name ?? fromId} → ${toNode?.name ?? toId}`,
        };
      }
      return item;
    });
  }, [items, snapshot]);

  const selectItem = (item: DiscoveryItem | null) => {
    setSelectedItem(item);
    setAdminNotes("");
  };

  const selectNextItem = () => {
    if (!selectedItem) return;
    const idx = resolvedItems.findIndex((i) => i.id === selectedItem.id);
    if (idx === -1) return;
    selectItem(idx + 1 < resolvedItems.length ? resolvedItems[idx + 1] : null);
  };

  const onApprove = async () => {
    if (!selectedItem) return;
    const ok = await handleProposalApprove(selectedItem.id);
    if (ok) selectNextItem();
  };

  const onReject = async () => {
    if (!selectedItem) return;
    const ok = await handleProposalReject(selectedItem.id, adminNotes);
    if (ok) selectNextItem();
  };

  const onBulkApprove = async () => {
    const ok = await handleBulkProposalApprove(bulkSelectedIds);
    if (ok) {
      if (selectedItem && bulkSelectedIds.has(selectedItem.id)) setSelectedItem(null);
      setBulkSelectedIds(new Set());
    }
  };

  const onBulkReject = async (notes: string) => {
    const ok = await handleBulkProposalReject(bulkSelectedIds, notes);
    if (ok) {
      if (selectedItem && bulkSelectedIds.has(selectedItem.id)) setSelectedItem(null);
      setBulkSelectedIds(new Set());
    }
  };

  const toggleBulk = (id: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAssign = async (uid: string | null) => {
    if (!selectedItem || !user) return;
    if (uid) await assignItem("graph_proposals", selectedItem.id, uid, user.uid);
    else await unassignItem("graph_proposals", selectedItem.id);
  };

  // ---------------------------------------------------------------------------
  // Signal quality badge
  // ---------------------------------------------------------------------------

  function SignalQualityBadge({ quality }: { quality?: SignalQualityMeta }) {
    if (!quality) return null;
    const total = quality.unmatched_count + quality.rejected_count + quality.pending_count + quality.approved_count;
    const allApproved = quality.approved_count === total;
    const hasRejected = quality.rejected_count > 0;
    const hasUnmatched = quality.unmatched_count > 0;

    const color = allApproved
      ? "bg-green-400/10 text-green-400 border-green-400/20"
      : hasRejected
        ? "bg-red-400/10 text-red-400 border-red-400/20"
        : hasUnmatched
          ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
          : "bg-white/5 text-white/60 border-white/10";

    return (
      <div className={`text-xs px-2.5 py-1 rounded-lg border ${color}`}>
        {quality.summary}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
      {/* Left panel */}
      <div className={`${selectedItem ? "hidden md:flex" : "flex"} w-full md:w-96 border-r border-white/10 flex-col`}>
        <div className="flex items-center gap-2 p-3 border-b border-white/10">
          <span className="text-xs font-medium text-white/60">Discovery Proposals</span>
          <div className="ml-auto flex items-center gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider ${
                  statusFilter === s ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"
                }`}>{s}</button>
            ))}
          </div>
        </div>

        {/* Select all */}
        {resolvedItems.length > 0 && statusFilter === "pending" && (
          <div className="flex items-center gap-2 px-3 py-1">
            <button
              onClick={() => setBulkSelectedIds(new Set(resolvedItems.map((i) => i.id)))}
              className="text-[10px] text-white/40 hover:text-white/60"
            >Select all {resolvedItems.length}</button>
            {bulkSelectedIds.size > 0 && (
              <button onClick={() => setBulkSelectedIds(new Set())}
                className="text-[10px] text-white/40 hover:text-white/60">Clear</button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <p className="text-white/40 text-sm text-center py-8">Loading...</p>
          ) : resolvedItems.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-8">No proposals match filters</p>
          ) : (
            resolvedItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                {statusFilter === "pending" && (
                  <input type="checkbox" checked={bulkSelectedIds.has(item.id)}
                    onChange={() => toggleBulk(item.id)} className="mt-3 accent-blue-500" />
                )}
                <button onClick={() => selectItem(item)}
                  className={`flex-1 text-left p-3 border-l-4 border-purple-500 rounded-r-lg transition-colors ${
                    selectedItem?.id === item.id ? "bg-white/10 ring-1 ring-white/20" : "bg-white/5 hover:bg-white/8"
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      {item.proposalType === "new_node" ? "New Node" : "New Edge"}
                    </span>
                    {item.status === "pending" && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                    {item.assigned_to && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                        {item.assigned_to === user?.uid ? "You" : "Assigned"}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-white/90 line-clamp-2">{item.title}</h4>
                  {item.signalQuality && (
                    <p className="text-[10px] text-amber-400/80 mt-1">{item.signalQuality.summary}</p>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        <BulkActionBar selectedCount={bulkSelectedIds.size} onApprove={onBulkApprove} onReject={onBulkReject} updating={updating} />
      </div>

      {/* Right: Detail panel */}
      <div className={`${selectedItem ? "flex" : "hidden md:flex"} flex-1 flex-col overflow-y-auto`}>
        {!selectedItem ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a proposal to review</div>
        ) : (
          <div className="p-4 md:p-6">
            <button onClick={() => setSelectedItem(null)}
              className="mb-4 text-sm text-gray-400 hover:text-white transition-colors md:hidden">&larr; Back</button>
            <div className="max-w-2xl">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="text-xl font-bold">{selectedItem.proposedName ?? selectedItem.title}</h2>
                <AssigneeDropdown currentAssignee={selectedItem.assigned_to}
                  allowedRoles={["discovery-reviewer", "lead"]} onAssign={handleAssign} />
              </div>

              {selectedItem.proposalType && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-400/10 text-purple-400 mb-4 inline-block">
                  {selectedItem.proposalType}
                </span>
              )}

              <p className="text-sm text-gray-300 leading-relaxed mb-6">{selectedItem.summary}</p>

              {/* Signal quality badge */}
              {selectedItem.signalQuality && (
                <div className="mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Signal Quality</h3>
                  <SignalQualityBadge quality={selectedItem.signalQuality} />
                </div>
              )}

              {/* Proposed fields */}
              {selectedItem.skeleton && Object.keys(selectedItem.skeleton).length > 0 && (
                <div className="bg-white/5 rounded p-4 mb-6 space-y-2">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Proposed Fields</h3>
                  {Object.entries(selectedItem.skeleton).map(([key, value]) => {
                    const isNodeField = key === "from_node" || key === "to_node";
                    const nodeMatch = isNodeField && typeof value === "string"
                      ? snapshot?.nodes.find((n) => n.id === value) : null;
                    return (
                      <div key={key} className="flex gap-2">
                        <span className="text-xs text-gray-500 min-w-[120px]">{key}</span>
                        <span className="text-xs text-white/80">
                          {nodeMatch ? `${nodeMatch.name} (${value})`
                            : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Supporting signals with status */}
              {selectedItem.supportingSignalIds.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                    Supporting Signals ({selectedItem.supportingSignalIds.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedItem.supportingSignalIds.map((sid) => {
                      const title = signalTitleMap.get(sid);
                      return (
                        <span key={sid}
                          className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-300 border border-white/10"
                          title={sid}>
                          {title ?? sid}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <AdminNotesInput value={adminNotes} onChange={setAdminNotes} />

              {selectedItem.status === "pending" && (
                <div className="flex gap-3 flex-wrap">
                  <button onClick={onApprove} disabled={updating}
                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    Approve</button>
                  <button onClick={onReject} disabled={updating}
                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    Reject</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
