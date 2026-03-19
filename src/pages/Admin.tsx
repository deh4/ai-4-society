import { useState } from "react";
import {
  doc,
  updateDoc,
  serverTimestamp,
  increment,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../store/AuthContext";
import { useNavigate } from "react-router-dom";
import { canAccessTab } from "../lib/roles";
import type { UserRole } from "../lib/roles";
import PipelineHealth from "../components/PipelineHealth";
import { UnifiedReviewList } from "../components/admin/UnifiedReviewList";
import type { ReviewItem } from "../components/admin/ReviewItemCard";
import { AgentsSection } from "../components/admin/AgentsSection";
import UsersTab from "../components/admin/UsersTab";
import AcknowledgmentModal from "../components/admin/AcknowledgmentModal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type AdminSection = "review" | "agents" | "users";

const SECTION_CONFIG: Record<AdminSection, { label: string; accent: string }> =
  {
    review: { label: "Review", accent: "border-cyan-400" },
    agents: { label: "Agents", accent: "border-purple-400" },
    users: { label: "Users", accent: "border-emerald-400" },
  };

const ALL_SECTIONS: AdminSection[] = ["review", "agents", "users"];

const RISK_LABELS: Record<string, string> = {
  R01: "Algorithmic Discrimination",
  R02: "Privacy Erosion",
  R03: "Disinformation",
  R04: "Labor Displacement",
  R05: "Autonomous Weapons",
  R06: "Power Concentration",
  R07: "Environmental Cost",
  R08: "Human Agency Loss",
  R09: "Surveillance",
  R10: "Model Collapse",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-400/10",
  approved: "text-green-400 bg-green-400/10",
  rejected: "text-red-400 bg-red-400/10",
  edited: "text-blue-400 bg-blue-400/10",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Admin() {
  const { user, userDoc, logOut } = useAuth();
  const navigate = useNavigate();

  // Section navigation
  const userRoles: UserRole[] = userDoc?.roles ?? [];
  const visibleSections = ALL_SECTIONS.filter((s) =>
    canAccessTab(userRoles, s)
  );
  const [section, setSection] = useState<AdminSection>(
    visibleSections[0] ?? "review"
  );

  // Acknowledgment modal
  const [acknowledged, setAcknowledged] = useState(
    () => !!(userDoc as Record<string, unknown> | null)?.acknowledgedAt
  );

  // Review state
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [filteredItems, setFilteredItems] = useState<ReviewItem[]>([]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const selectItem = (item: ReviewItem | null) => {
    setSelectedItem(item);
    setAdminNotes("");
  };

  /** After an action, auto-select next pending item from filtered list */
  const selectNextItem = () => {
    if (!selectedItem || filteredItems.length === 0) return;
    const currentIndex = filteredItems.findIndex(
      (item) => item.id === selectedItem.id && item.type === selectedItem.type
    );
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex < filteredItems.length) {
      selectItem(filteredItems[nextIndex]);
    } else {
      selectItem(null);
    }
  };

  /** Remove an item from the filtered list immediately (optimistic update) */
  const removeItemFromList = (itemId: string, itemType: ReviewItem["type"]) => {
    setFilteredItems((prev) =>
      prev.filter((item) => !(item.id === itemId && item.type === itemType))
    );
  };

  /** Approve or reject a signal via direct Firestore write */
  const handleSignalAction = async (
    id: string,
    status: "approved" | "rejected" | "edited" | "pending"
  ) => {
    if (status === "rejected" && !adminNotes.trim()) {
      alert("Please add a note explaining why this signal is rejected.");
      return;
    }
    setUpdating(true);
    try {
      await updateDoc(doc(db, "signals", id), {
        status,
        admin_notes: adminNotes || null,
        reviewed_at: serverTimestamp(),
        reviewed_by: user?.uid ?? null,
      });
      if (user?.uid) {
        updateDoc(doc(db, "users", user.uid), {
          totalReviews: increment(1),
        }).catch(() => {});
      }
      // Optimistically remove from list and select next
      removeItemFromList(id, "signal");
      selectNextItem();
    } finally {
      setUpdating(false);
    }
  };

  /** Approve a discovery or validation proposal via callable */
  const handleProposalApprove = async (proposalId: string) => {
    setUpdating(true);
    try {
      const approve = httpsCallable(functions, "approveGraphProposal");
      await approve({ proposalId });
      // Optimistically remove from list and select next
      // Determine type based on selectedItem
      const itemType = selectedItem?.type ?? "discovery";
      removeItemFromList(proposalId, itemType);
      selectNextItem();
    } finally {
      setUpdating(false);
    }
  };

  /** Reject a discovery or validation proposal via callable */
  const handleProposalReject = async (proposalId: string) => {
    if (!adminNotes.trim()) {
      alert("Please add a note explaining the rejection.");
      return;
    }
    setUpdating(true);
    try {
      const reject = httpsCallable(functions, "rejectGraphProposal");
      await reject({ proposalId, reason: adminNotes });
      // Optimistically remove from list and select next
      const itemType = selectedItem?.type ?? "discovery";
      removeItemFromList(proposalId, itemType);
      selectNextItem();
    } finally {
      setUpdating(false);
    }
  };

  /** Bulk-reject selected signals */
  const handleBulkReject = async () => {
    if (bulkSelectedIds.size === 0 || !adminNotes.trim()) {
      alert("Select items and add notes before bulk rejecting.");
      return;
    }
    setUpdating(true);
    try {
      const batch = writeBatch(db);
      for (const id of bulkSelectedIds) {
        batch.update(doc(db, "signals", id), {
          status: "rejected",
          admin_notes: adminNotes,
          reviewed_at: serverTimestamp(),
          reviewed_by: user?.uid ?? null,
        });
      }
      await batch.commit();
      if (user?.uid) {
        updateDoc(doc(db, "users", user.uid), {
          totalReviews: increment(bulkSelectedIds.size),
        }).catch(() => {});
      }
      setBulkSelectedIds(new Set());
      setAdminNotes("");
      if (selectedItem && bulkSelectedIds.has(selectedItem.id)) {
        setSelectedItem(null);
      }
    } finally {
      setUpdating(false);
    }
  };

  // Bulk selection callbacks
  const onBulkToggle = (id: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const onBulkSelectAll = (ids: string[]) =>
    setBulkSelectedIds(new Set(ids));
  const onBulkClear = () => setBulkSelectedIds(new Set());

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const severityColor = (hint: string) => {
    if (hint === "Critical") return "text-red-400";
    if (hint === "Emerging") return "text-orange-400";
    return "text-gray-400";
  };

  /** Detail panel for a signal */
  const renderSignalDetail = (item: ReviewItem) => (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-2">{item.title}</h2>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-gray-500">{item.sourceName}</span>
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:underline"
          >
            Source &rarr;
          </a>
        )}
      </div>

      <p className="text-sm text-gray-300 leading-relaxed mb-6">
        {item.summary}
      </p>

      {/* Classification */}
      <div className="bg-white/5 rounded p-4 mb-6 space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
          Classification
        </h3>

        {item.signalType && (
          <div>
            <span className="text-[10px] text-gray-500">Signal Type</span>
            <div className="text-sm text-white/80 mt-0.5">{item.signalType}</div>
          </div>
        )}

        {item.riskCategories && item.riskCategories.length > 0 && (
          <div>
            <span className="text-[10px] text-gray-500">Risk Categories</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {item.riskCategories.map((rc) => (
                <span
                  key={rc}
                  className="text-xs px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400"
                >
                  {rc}: {RISK_LABELS[rc] ?? rc}
                </span>
              ))}
            </div>
          </div>
        )}

        {item.solutionIds && item.solutionIds.length > 0 && (
          <div>
            <span className="text-[10px] text-gray-500">Solution IDs</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {item.solutionIds.map((sid) => (
                <span
                  key={sid}
                  className="text-xs px-2 py-0.5 rounded bg-purple-400/10 text-purple-400"
                >
                  {sid}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-6">
          {item.severityHint && (
            <div>
              <span className="text-[10px] text-gray-500">Severity</span>
              <div
                className={`text-sm font-bold ${severityColor(item.severityHint)}`}
              >
                {item.severityHint}
              </div>
            </div>
          )}
          {item.confidenceScore != null && (
            <div>
              <span className="text-[10px] text-gray-500">Confidence</span>
              <div className="text-sm font-bold">
                {Math.round(item.confidenceScore * 100)}%
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Notes */}
      {renderAdminNotes()}

      {/* Actions */}
      {item.status === "pending" && (
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => handleSignalAction(item.id, "approved")}
            disabled={updating}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => handleSignalAction(item.id, "rejected")}
            disabled={updating}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => handleSignalAction(item.id, "edited")}
            disabled={updating}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Approve (Edited)
          </button>
        </div>
      )}

      {item.status !== "pending" && (
        <div className="flex items-center gap-3">
          <span
            className={`text-sm px-3 py-1 rounded ${STATUS_COLORS[item.status] ?? ""}`}
          >
            {item.status}
          </span>
          <button
            onClick={() => handleSignalAction(item.id, "pending")}
            disabled={updating}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Reset to Pending
          </button>
        </div>
      )}
    </div>
  );

  /** Detail panel for a discovery proposal */
  const renderDiscoveryDetail = (item: ReviewItem) => (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-2">
        {item.proposedName ?? item.title}
      </h2>

      {item.proposalType && (
        <span className="text-xs px-2 py-0.5 rounded bg-purple-400/10 text-purple-400 mb-4 inline-block">
          {item.proposalType}
        </span>
      )}

      <p className="text-sm text-gray-300 leading-relaxed mb-6">
        {item.summary}
      </p>

      {/* Skeleton / proposed fields */}
      {item.skeleton && Object.keys(item.skeleton).length > 0 && (
        <div className="bg-white/5 rounded p-4 mb-6 space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
            Proposed Fields
          </h3>
          {Object.entries(item.skeleton).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-xs text-gray-500 min-w-[120px]">
                {key}
              </span>
              <span className="text-xs text-white/80">
                {typeof value === "object"
                  ? JSON.stringify(value, null, 2)
                  : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Supporting signals */}
      {item.supportingSignalIds && item.supportingSignalIds.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
            Supporting Signals ({item.supportingSignalIds.length})
          </h3>
          <div className="flex flex-wrap gap-1">
            {item.supportingSignalIds.map((sid) => (
              <span
                key={sid}
                className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400"
              >
                {sid}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Admin Notes */}
      {renderAdminNotes()}

      {/* Actions */}
      {item.status === "pending" && (
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => handleProposalApprove(item.id)}
            disabled={updating}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => handleProposalReject(item.id)}
            disabled={updating}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );

  /** Detail panel for a validation proposal */
  const renderValidationDetail = (item: ReviewItem) => (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-2">
        {item.documentName ?? item.title}
      </h2>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {item.documentType && (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-400/10 text-amber-400">
            {item.documentType}
          </span>
        )}
        {item.documentId && (
          <span className="text-xs text-gray-500">{item.documentId}</span>
        )}
        {item.confidence != null && (
          <span className="text-xs text-gray-400">
            Confidence: {Math.round(item.confidence * 100)}%
          </span>
        )}
      </div>

      {item.overallReasoning && (
        <p className="text-sm text-gray-300 leading-relaxed mb-6">
          {item.overallReasoning}
        </p>
      )}

      {/* Proposed changes */}
      {item.proposedChanges && Object.keys(item.proposedChanges).length > 0 && (
        <div className="bg-white/5 rounded p-4 mb-6 space-y-3">
          <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
            Proposed Changes
          </h3>
          {Object.entries(item.proposedChanges).map(
            ([field, { current_value, proposed_value }]) => (
              <div key={field} className="space-y-1">
                <span className="text-xs font-medium text-white/70">
                  {field}
                </span>
                <div className="flex gap-4 text-xs">
                  <div className="flex-1">
                    <span className="text-gray-500 block text-[10px]">
                      Current
                    </span>
                    <span className="text-red-400/80">
                      {String(current_value)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <span className="text-gray-500 block text-[10px]">
                      Proposed
                    </span>
                    <span className="text-green-400/80">
                      {String(proposed_value)}
                    </span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Admin Notes */}
      {renderAdminNotes()}

      {/* Actions */}
      {item.status === "pending" && (
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => handleProposalApprove(item.id)}
            disabled={updating}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => handleProposalReject(item.id)}
            disabled={updating}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );

  /** Shared admin notes textarea */
  const renderAdminNotes = () => (
    <div className="mb-4">
      <label className="text-xs text-gray-400 block mb-1">Admin Notes</label>
      <textarea
        value={adminNotes}
        onChange={(e) => setAdminNotes(e.target.value)}
        placeholder="Add context or reason for rejection..."
        className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-white placeholder-gray-600 resize-none h-20 focus:outline-none focus:border-cyan-400/50"
      />
    </div>
  );

  /** Render the right-side detail panel based on selected item type */
  const renderDetailPanel = () => {
    if (!selectedItem) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          Select an item to review
        </div>
      );
    }

    return (
      <div className="p-4 md:p-6">
        {/* Mobile back button */}
        <button
          onClick={() => setSelectedItem(null)}
          className="mb-4 text-sm text-gray-400 hover:text-white transition-colors md:hidden"
        >
          &larr; Back to list
        </button>

        {selectedItem.type === "signal" && renderSignalDetail(selectedItem)}
        {selectedItem.type === "discovery" &&
          renderDiscoveryDetail(selectedItem)}
        {selectedItem.type === "validation" &&
          renderValidationDetail(selectedItem)}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {!acknowledged && (
        <AcknowledgmentModal onComplete={() => setAcknowledged(true)} />
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-gray-400 hover:text-white transition-colors shrink-0"
          >
            &larr; Home
          </button>
          <h1 className="text-lg font-bold shrink-0">Admin</h1>
          <PipelineHealth />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/help")}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Help
          </button>
          <span className="text-xs text-gray-500 truncate">{user?.email}</span>
          <button
            onClick={logOut}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Section navigation */}
      <div className="flex gap-4 px-4 border-b border-white/10 overflow-x-auto md:gap-6 md:px-6">
        {visibleSections.map((s) => (
          <button
            key={s}
            onClick={() => {
              setSection(s);
              setSelectedItem(null);
              setBulkSelectedIds(new Set());
            }}
            className={`py-3 text-sm transition-colors border-b-2 whitespace-nowrap ${
              section === s
                ? `${SECTION_CONFIG[s].accent} text-white`
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {SECTION_CONFIG[s].label}
          </button>
        ))}
        <button
          onClick={() => navigate("/observatory")}
          className="py-3 text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-300 whitespace-nowrap"
        >
          Observatory
        </button>
      </div>

      {/* Section content */}
      {section === "review" && (
        <div className="flex flex-col md:flex-row h-[calc(100vh-105px)]">
          {/* Left: Unified review list */}
          <div
            className={`${
              selectedItem ? "hidden md:flex" : "flex"
            } w-full md:w-96 border-r border-white/10 flex-col`}
          >
            <UnifiedReviewList
              onSelectItem={selectItem}
              selectedId={selectedItem?.id ?? null}
              bulkSelectedIds={bulkSelectedIds}
              onBulkToggle={onBulkToggle}
              onBulkSelectAll={onBulkSelectAll}
              onBulkClear={onBulkClear}
              onFilteredItemsChange={setFilteredItems}
            />

            {/* Bulk reject bar */}
            {bulkSelectedIds.size > 0 && (
              <div className="border-t border-white/10 p-3 space-y-2">
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Bulk rejection note (required)..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-red-400/50"
                />
                <button
                  onClick={handleBulkReject}
                  disabled={updating || !adminNotes.trim()}
                  className="w-full px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {updating
                    ? "Rejecting..."
                    : `Reject ${bulkSelectedIds.size} selected`}
                </button>
              </div>
            )}
          </div>

          {/* Right: Detail panel */}
          <div
            className={`${
              selectedItem ? "flex" : "hidden md:flex"
            } flex-1 flex-col overflow-y-auto`}
          >
            {renderDetailPanel()}
          </div>
        </div>
      )}

      {section === "agents" && (
        <div className="p-4 md:p-6">
          <AgentsSection />
        </div>
      )}

      {section === "users" && <UsersTab />}
    </div>
  );
}
