import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../store/AuthContext";
import { useProposalActions } from "../../hooks/useProposalActions";
import { assignItem, unassignItem } from "../../data/assignments";
import { AdminNotesInput } from "./AdminNotesInput";
import { BulkActionBar } from "./BulkActionBar";
import { AssigneeDropdown } from "./AssigneeDropdown";
import type { ValidationItem } from "../../types/review";

const STATUS_OPTIONS = ["pending", "all", "approved", "rejected"] as const;

export default function ScoringTab() {
  const { user } = useAuth();
  const {
    handleProposalApprove, handleProposalReject,
    handleBulkProposalApprove, handleBulkProposalReject, updating,
  } = useProposalActions();

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedItem, setSelectedItem] = useState<ValidationItem | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  // Subscribe to validation proposals (update_node)
  useEffect(() => {
    const proposalsRef = collection(db, "graph_proposals");
    const constraints = [
      where("proposal_type", "==", "update_node"),
      ...(statusFilter !== "all" ? [where("status", "==", statusFilter)] : []),
      orderBy("created_at", "desc"),
    ];
    const q = query(proposalsRef, ...constraints);

    const unsub = onSnapshot(q, (snap) => {
      const validations: ValidationItem[] = snap.docs.map((d) => {
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
          proposedChanges: (ud?.proposed_changes as Record<string, { current_value: unknown; proposed_value: unknown }>) ?? {},
          overallReasoning: ud?.overall_reasoning as string,
          confidence: data.confidence as number,
          assigned_to: data.assigned_to as string | undefined,
          assigned_by: data.assigned_by as string | undefined,
        };
      });
      setItems(validations);
      setLoading(false);
    });
    return unsub;
  }, [statusFilter]);

  const selectItem = (item: ValidationItem | null) => {
    setSelectedItem(item);
    setAdminNotes("");
  };

  const selectNextItem = () => {
    if (!selectedItem) return;
    const idx = items.findIndex((i) => i.id === selectedItem.id);
    if (idx === -1) return;
    selectItem(idx + 1 < items.length ? items[idx + 1] : null);
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

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
      {/* Left panel */}
      <div className={`${selectedItem ? "hidden md:flex" : "flex"} w-full md:w-96 border-r border-white/10 flex-col`}>
        <div className="flex items-center gap-2 p-3 border-b border-white/10">
          <span className="text-xs font-medium text-white/60">Scoring Proposals</span>
          <div className="ml-auto flex items-center gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider ${
                  statusFilter === s ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"
                }`}>{s}</button>
            ))}
          </div>
        </div>

        {items.length > 0 && statusFilter === "pending" && (
          <div className="flex items-center gap-2 px-3 py-1">
            <button onClick={() => setBulkSelectedIds(new Set(items.map((i) => i.id)))}
              className="text-[10px] text-white/40 hover:text-white/60">Select all {items.length}</button>
            {bulkSelectedIds.size > 0 && (
              <button onClick={() => setBulkSelectedIds(new Set())}
                className="text-[10px] text-white/40 hover:text-white/60">Clear</button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <p className="text-white/40 text-sm text-center py-8">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-8">No proposals match filters</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                {statusFilter === "pending" && (
                  <input type="checkbox" checked={bulkSelectedIds.has(item.id)}
                    onChange={() => toggleBulk(item.id)} className="mt-3 accent-blue-500" />
                )}
                <button onClick={() => selectItem(item)}
                  className={`flex-1 text-left p-3 border-l-4 border-amber-500 rounded-r-lg transition-colors ${
                    selectedItem?.id === item.id ? "bg-white/10 ring-1 ring-white/20" : "bg-white/5 hover:bg-white/8"
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      {item.documentType ?? "update"}
                    </span>
                    {item.status === "pending" && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                    {item.assigned_to && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                        {item.assigned_to === user?.uid ? "You" : "Assigned"}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-white/90 line-clamp-2">{item.title}</h4>
                  <p className="text-xs text-white/50 mt-1 line-clamp-1">
                    {item.proposedChanges ? `${Object.keys(item.proposedChanges).length} field changes` : ""}
                  </p>
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
                <h2 className="text-xl font-bold">{selectedItem.documentName ?? selectedItem.title}</h2>
                <AssigneeDropdown currentAssignee={selectedItem.assigned_to}
                  allowedRoles={["scoring-reviewer", "lead"]} onAssign={handleAssign} />
              </div>

              <div className="flex items-center gap-3 mb-4 flex-wrap">
                {selectedItem.documentType && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-400/10 text-amber-400">
                    {selectedItem.documentType}
                  </span>
                )}
                {selectedItem.documentId && (
                  <span className="text-xs text-gray-500">{selectedItem.documentId}</span>
                )}
                {selectedItem.confidence != null && (
                  <span className="text-xs text-gray-400">
                    Confidence: {Math.round(selectedItem.confidence * 100)}%
                  </span>
                )}
              </div>

              {selectedItem.overallReasoning && (
                <p className="text-sm text-gray-300 leading-relaxed mb-6">{selectedItem.overallReasoning}</p>
              )}

              {/* Proposed changes diff */}
              {selectedItem.proposedChanges && Object.keys(selectedItem.proposedChanges).length > 0 && (
                <div className="bg-white/5 rounded p-4 mb-6 space-y-3">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Proposed Changes</h3>
                  {Object.entries(selectedItem.proposedChanges).map(
                    ([field, { current_value, proposed_value }]) => (
                      <div key={field} className="space-y-1">
                        <span className="text-xs font-medium text-white/70">{field}</span>
                        <div className="flex gap-4 text-xs">
                          <div className="flex-1">
                            <span className="text-gray-500 block text-[10px]">Current</span>
                            <span className="text-red-400/80">{String(current_value)}</span>
                          </div>
                          <div className="flex-1">
                            <span className="text-gray-500 block text-[10px]">Proposed</span>
                            <span className="text-green-400/80">{String(proposed_value)}</span>
                          </div>
                        </div>
                      </div>
                    ),
                  )}
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

