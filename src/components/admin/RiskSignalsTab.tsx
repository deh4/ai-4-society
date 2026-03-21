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
import { useSignalActions } from "../../hooks/useSignalActions";
import { assignItem, unassignItem } from "../../data/assignments";
import { AdminNotesInput } from "./AdminNotesInput";
import { BulkActionBar } from "./BulkActionBar";
import { SignalDateGroup } from "./SignalDateGroup";
import { AssigneeDropdown } from "./AssigneeDropdown";
import type { RiskSignalItem } from "../../types/review";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_LABELS: Record<string, string> = {
  R01: "Algorithmic Discrimination", R02: "Privacy Erosion", R03: "Disinformation",
  R04: "Labor Displacement", R05: "Autonomous Weapons", R06: "Power Concentration",
  R07: "Environmental Cost", R08: "Human Agency Loss", R09: "Surveillance", R10: "Model Collapse",
};

const SOLUTION_LABELS: Record<string, string> = {
  S01: "AI Safety & Alignment Research", S02: "Privacy-Preserving AI", S03: "Regulatory Frameworks",
  S04: "Workforce Transition", S05: "AI Arms Control", S06: "Open Source & Decentralization",
  S07: "Green AI", S08: "Human-AI Collaboration", S09: "Transparency & Accountability", S10: "Data Quality & Curation",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-400/10",
  approved: "text-green-400 bg-green-400/10",
  rejected: "text-red-400 bg-red-400/10",
  edited: "text-blue-400 bg-blue-400/10",
};

const STATUS_OPTIONS = ["pending", "all", "approved", "rejected"] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RiskSignalsTab() {
  const { user } = useAuth();
  const { snapshot } = useGraph();
  const { handleSignalAction, handleBulkSignalAction, updating } = useSignalActions();

  // Data
  const [items, setItems] = useState<RiskSignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  // Selection
  const [selectedItem, setSelectedItem] = useState<RiskSignalItem | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  // Subscribe to risk signals (risk | both)
  useEffect(() => {
    const signalsRef = collection(db, "signals");
    const constraints = [
      where("signal_type", "in", ["risk", "both"]),
      ...(statusFilter !== "all" ? [where("status", "==", statusFilter)] : []),
      orderBy("fetched_at", "desc"),
    ];
    const q = query(signalsRef, ...constraints);

    const unsub = onSnapshot(q, (snap) => {
      const signals: RiskSignalItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: "risk-signal" as const,
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
          assigned_to: data.assigned_to as string | undefined,
          assigned_by: data.assigned_by as string | undefined,
        };
      });
      setItems(signals);
      setLoading(false);
    });
    return unsub;
  }, [statusFilter]);

  // Group by date
  const groupedItems = useMemo(() => {
    const groups = new Map<string, RiskSignalItem[]>();
    for (const item of items) {
      const dateKey = item.createdAt
        ? new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10)
        : "unknown";
      const group = groups.get(dateKey) ?? [];
      group.push(item);
      groups.set(dateKey, group);
    }
    // Sort keys newest first
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  // Handlers
  const selectItem = (item: RiskSignalItem | null) => {
    setSelectedItem(item);
    setAdminNotes("");
  };

  const selectNextItem = () => {
    if (!selectedItem) return;
    const idx = items.findIndex((i) => i.id === selectedItem.id);
    if (idx === -1) return;
    const next = idx + 1 < items.length ? items[idx + 1] : null;
    selectItem(next);
  };

  const onAction = async (id: string, status: "approved" | "rejected" | "edited" | "pending") => {
    const ok = await handleSignalAction(id, status, adminNotes);
    if (ok) selectNextItem();
  };

  const onBulkApprove = async (notes: string) => {
    const ok = await handleBulkSignalAction(bulkSelectedIds, "approved", notes);
    if (ok) {
      if (selectedItem && bulkSelectedIds.has(selectedItem.id)) setSelectedItem(null);
      setBulkSelectedIds(new Set());
    }
  };

  const onBulkReject = async (notes: string) => {
    const ok = await handleBulkSignalAction(bulkSelectedIds, "rejected", notes);
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
    if (uid) {
      await assignItem("signals", selectedItem.id, uid, user.uid);
    } else {
      await unassignItem("signals", selectedItem.id);
    }
  };

  const severityColor = (hint?: string) => {
    if (hint === "Critical") return "text-red-400";
    if (hint === "Emerging") return "text-orange-400";
    return "text-gray-400";
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
      {/* Left: Signal list */}
      <div className={`${selectedItem ? "hidden md:flex" : "flex"} w-full md:w-96 border-r border-white/10 flex-col`}>
        {/* Filters */}
        <div className="flex items-center gap-2 p-3 border-b border-white/10">
          <span className="text-xs font-medium text-white/60">Risk Signals</span>
          <div className="ml-auto flex items-center gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider ${
                  statusFilter === s ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Items grouped by date */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-white/40 text-sm text-center py-8">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-8">No signals match filters</p>
          ) : (
            groupedItems.map(([dateKey, group]) => {
              const groupIds = group.map((i) => i.id);
              const selectedInGroup = groupIds.filter((id) => bulkSelectedIds.has(id)).length;
              return (
                <SignalDateGroup
                  key={dateKey}
                  date={dateKey}
                  count={group.length}
                  pendingCount={group.filter((i) => i.status === "pending").length}
                  selectedCount={selectedInGroup}
                  totalInGroup={group.length}
                  onSelectAll={() => setBulkSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of groupIds) next.add(id);
                    return next;
                  })}
                  onDeselectAll={() => setBulkSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of groupIds) next.delete(id);
                    return next;
                  })}
                >
                  {group.map((item) => (
                    <div key={item.id} className="flex items-start gap-2">
                      {statusFilter === "pending" && (
                        <input
                          type="checkbox"
                          checked={bulkSelectedIds.has(item.id)}
                          onChange={() => toggleBulk(item.id)}
                          className="mt-3 accent-blue-500"
                        />
                      )}
                      <button
                        onClick={() => selectItem(item)}
                        className={`flex-1 text-left p-3 border-l-4 border-red-500 rounded-r-lg transition-colors ${
                          selectedItem?.id === item.id
                            ? "bg-white/10 ring-1 ring-white/20"
                            : "bg-white/5 hover:bg-white/8"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                            {item.signalType === "both" ? "Risk + Solution" : "Risk"}
                          </span>
                          {item.status === "pending" && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                          {item.assigned_to && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                              {item.assigned_to === user?.uid ? "You" : "Assigned"}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-medium text-white/90 line-clamp-2">{item.title}</h4>
                        <p className="text-xs text-white/50 mt-1 line-clamp-1">{item.sourceName}</p>
                      </button>
                    </div>
                  ))}
                </SignalDateGroup>
              );
            })
          )}
        </div>

        {/* Bulk action bar */}
        <BulkActionBar
          selectedCount={bulkSelectedIds.size}
          onApprove={onBulkApprove}
          onReject={onBulkReject}
          updating={updating}
        />
      </div>

      {/* Right: Detail panel */}
      <div className={`${selectedItem ? "flex" : "hidden md:flex"} flex-1 flex-col overflow-y-auto`}>
        {!selectedItem ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Select a signal to review
          </div>
        ) : (
          <div className="p-4 md:p-6">
            {/* Mobile back */}
            <button
              onClick={() => setSelectedItem(null)}
              className="mb-4 text-sm text-gray-400 hover:text-white transition-colors md:hidden"
            >
              &larr; Back to list
            </button>

            <div className="max-w-2xl">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="text-xl font-bold">{selectedItem.title}</h2>
                <AssigneeDropdown
                  currentAssignee={selectedItem.assigned_to}
                  allowedRoles={["signal-reviewer", "lead"]}
                  onAssign={handleAssign}
                />
              </div>

              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-xs text-gray-500">{selectedItem.sourceName}</span>
                {selectedItem.sourceUrl && (
                  <a href={selectedItem.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:underline">Source &rarr;</a>
                )}
              </div>

              <p className="text-sm text-gray-300 leading-relaxed mb-6">{selectedItem.summary}</p>

              {/* Classification */}
              <div className="bg-white/5 rounded p-4 mb-6 space-y-3">
                <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Classification</h3>

                {selectedItem.signalType && (
                  <div>
                    <span className="text-[10px] text-gray-500">Signal Type</span>
                    <div className="text-sm text-white/80 mt-0.5">{selectedItem.signalType}</div>
                  </div>
                )}

                {selectedItem.riskCategories.length > 0 && (
                  <div>
                    <span className="text-[10px] text-gray-500">Risk Categories</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {selectedItem.riskCategories.map((rc) => (
                        <span key={rc} className="text-xs px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                          {rc}: {RISK_LABELS[rc] ?? rc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.solutionIds.length > 0 && (
                  <div>
                    <span className="text-[10px] text-gray-500">Solution Categories</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {selectedItem.solutionIds.map((sid) => (
                        <span key={sid} className="text-xs px-2 py-0.5 rounded bg-purple-400/10 text-purple-400">
                          {sid}: {SOLUTION_LABELS[sid] ?? sid}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-6">
                  {selectedItem.severityHint && (
                    <div>
                      <span className="text-[10px] text-gray-500">Severity</span>
                      <div className={`text-sm font-bold ${severityColor(selectedItem.severityHint)}`}>
                        {selectedItem.severityHint}
                      </div>
                    </div>
                  )}
                  {selectedItem.confidenceScore != null && (
                    <div>
                      <span className="text-[10px] text-gray-500">Confidence</span>
                      <div className="text-sm font-bold">{Math.round(selectedItem.confidenceScore * 100)}%</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Linked Nodes */}
              {selectedItem.relatedNodeIds.length > 0 && (
                <div className="bg-white/5 rounded p-4 mb-6 space-y-2">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Linked to</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.relatedNodeIds.map((nodeId) => {
                      const node = snapshot?.nodes.find((n) => n.id === nodeId);
                      const isRisk = node?.type === "risk";
                      const isSolution = node?.type === "solution";
                      return (
                        <span key={nodeId} className={`text-xs px-2.5 py-1 rounded-lg ${
                          isRisk ? "bg-red-400/10 text-red-400 border border-red-400/20"
                            : isSolution ? "bg-green-400/10 text-green-400 border border-green-400/20"
                            : "bg-white/5 text-gray-400 border border-white/10"
                        }`}>
                          {node ? `${node.id} · ${node.name}` : nodeId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Admin Notes */}
              <AdminNotesInput value={adminNotes} onChange={setAdminNotes} />

              {/* Actions */}
              {selectedItem.status === "pending" ? (
                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => onAction(selectedItem.id, "approved")} disabled={updating}
                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => onAction(selectedItem.id, "rejected")} disabled={updating}
                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    Reject
                  </button>
                  <button onClick={() => onAction(selectedItem.id, "edited")} disabled={updating}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    Approve (Edited)
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className={`text-sm px-3 py-1 rounded ${STATUS_COLORS[selectedItem.status] ?? ""}`}>
                    {selectedItem.status}
                  </span>
                  <button onClick={() => onAction(selectedItem.id, "pending")} disabled={updating}
                    className="text-xs text-gray-400 hover:text-white transition-colors">
                    Reset to Pending
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
