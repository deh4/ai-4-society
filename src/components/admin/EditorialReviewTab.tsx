// src/components/admin/EditorialReviewTab.tsx
import { useState, useEffect } from "react";
import { subscribeEditorialHooks, updateEditorialStatus } from "../../data/editorial";
import { useAuth } from "../../store/AuthContext";
import { useGraph } from "../../store/GraphContext";
import { AssigneeDropdown } from "./AssigneeDropdown";
import { assignItem, unassignItem } from "../../data/assignments";
import type { EditorialHook } from "../../types/editorial";

export default function EditorialReviewTab() {
  const { user } = useAuth();
  const { snapshot } = useGraph();
  const [hooks, setHooks] = useState<EditorialHook[]>([]);
  const [selected, setSelected] = useState<EditorialHook | null>(null);
  const [editText, setEditText] = useState("");
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  useEffect(() => {
    return subscribeEditorialHooks(filter, setHooks);
  }, [filter]);

  const handleSelect = (h: EditorialHook) => {
    setSelected(h);
    setEditText(h.hook_text);
  };

  const handleAction = async (status: "approved" | "rejected") => {
    if (!selected || !user) return;
    setUpdating(true);
    try {
      await updateEditorialStatus(
        selected.id,
        status,
        user.uid,
        status === "approved" ? editText : undefined,
      );
      setSelected(null);
    } finally {
      setUpdating(false);
    }
  };

  const handleAssign = async (uid: string | null) => {
    if (!selected || !user) return;
    if (uid) await assignItem("editorial_hooks", selected.id, uid, user.uid);
    else await unassignItem("editorial_hooks", selected.id);
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
      {/* Left: List */}
      <div className={`${selected ? "hidden md:flex" : "flex"} w-full md:w-80 border-r border-white/10 flex-col`}>
        <div className="flex gap-2 p-3 border-b border-white/10">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider ${
                filter === s ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {hooks.map((h) => (
            <button
              key={h.id}
              onClick={() => handleSelect(h)}
              className={`w-full px-3 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 ${
                selected?.id === h.id ? "bg-white/10" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {h.status === "pending" && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                {h.assigned_to && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400">
                    {h.assigned_to === user?.uid ? "You" : "Assigned"}
                  </span>
                )}
              </div>
              <div className="text-xs text-white/80 line-clamp-2">{h.signal_title}</div>
              <div className="text-[9px] text-gray-600 mt-1">
                {h.source_name} · Score: {h.impact_score.toFixed(1)}
              </div>
            </button>
          ))}
          {hooks.length === 0 && (
            <div className="p-6 text-center text-gray-600 text-sm">No hooks found</div>
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className={`${selected ? "flex" : "hidden md:flex"} flex-1 flex-col overflow-y-auto`}>
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Select a hook to review
          </div>
        ) : (
          <div className="p-4 md:p-6">
            <button onClick={() => setSelected(null)}
              className="mb-4 text-sm text-gray-400 hover:text-white transition-colors md:hidden">&larr; Back</button>
            <div className="max-w-xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Signal Headline</div>
                  <h3 className="text-lg text-white font-semibold">{selected.signal_title}</h3>
                  <div className="text-[10px] text-gray-600 mt-1">
                    {selected.source_name} · Credibility: {(selected.source_credibility * 100).toFixed(0)}%
                  </div>
                </div>
                <AssigneeDropdown currentAssignee={selected.assigned_to}
                  allowedRoles={["editor", "lead"]} onAssign={handleAssign} />
              </div>

              {/* Editorial Hook */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Editorial Hook</div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white resize-none focus:outline-none focus:border-cyan-400/50"
                  rows={4}
                />
              </div>

              {/* Linked Nodes */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Linked Nodes</div>
                <div className="text-xs text-gray-400 flex flex-wrap gap-1.5">
                  {selected.related_node_ids.length === 0 && "None"}
                  {selected.related_node_ids.map((id) => {
                    const node = snapshot?.nodes.find((n) => n.id === id);
                    return (
                      <span key={id} className="px-2 py-0.5 bg-white/5 rounded text-[10px]">
                        {node?.name ?? id}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              {selected.status === "pending" && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleAction("approved")}
                    disabled={updating}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                  >
                    {updating ? "Saving..." : "Approve"}
                  </button>
                  <button
                    onClick={() => handleAction("rejected")}
                    disabled={updating}
                    className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm rounded transition-colors"
                  >
                    Reject
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
