import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export function useProposalActions() {
  const [updating, setUpdating] = useState(false);

  /** Approve a discovery or validation proposal via callable */
  const handleProposalApprove = async (proposalId: string) => {
    setUpdating(true);
    try {
      const approve = httpsCallable(functions, "approveGraphProposal");
      const result = await approve({ proposalId });
      const data = result.data as Record<string, unknown>;
      if (data.action === "auto_rejected") {
        alert(`Proposal auto-rejected: ${data.reason as string}`);
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Approve failed: ${msg}`);
      return false;
    } finally {
      setUpdating(false);
    }
  };

  /** Reject a discovery or validation proposal via callable */
  const handleProposalReject = async (proposalId: string, reason: string) => {
    if (!reason.trim()) {
      alert("Please add a note explaining the rejection.");
      return false;
    }
    setUpdating(true);
    try {
      const reject = httpsCallable(functions, "rejectGraphProposal");
      await reject({ proposalId, reason });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Reject failed: ${msg}`);
      return false;
    } finally {
      setUpdating(false);
    }
  };

  /** Bulk approve proposals */
  const handleBulkProposalApprove = async (ids: Set<string>) => {
    if (ids.size === 0) return false;
    setUpdating(true);
    try {
      const approve = httpsCallable(functions, "approveGraphProposal");
      for (const id of ids) {
        await approve({ proposalId: id });
      }
      return true;
    } finally {
      setUpdating(false);
    }
  };

  /** Bulk reject proposals */
  const handleBulkProposalReject = async (ids: Set<string>, reason: string) => {
    if (ids.size === 0 || !reason.trim()) {
      alert("Select items and add notes before bulk rejecting.");
      return false;
    }
    setUpdating(true);
    try {
      const reject = httpsCallable(functions, "rejectGraphProposal");
      for (const id of ids) {
        await reject({ proposalId: id, reason });
      }
      return true;
    } finally {
      setUpdating(false);
    }
  };

  return {
    handleProposalApprove,
    handleProposalReject,
    handleBulkProposalApprove,
    handleBulkProposalReject,
    updating,
  };
}
