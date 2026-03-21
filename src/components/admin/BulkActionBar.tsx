import { useState } from "react";

interface Props {
  selectedCount: number;
  onApprove: (notes: string) => void;
  onReject: (notes: string) => void;
  updating: boolean;
}

export function BulkActionBar({ selectedCount, onApprove, onReject, updating }: Props) {
  const [notes, setNotes] = useState("");

  if (selectedCount === 0) return null;

  return (
    <div className="border-t border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/60">{selectedCount} selected</span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (required for rejection)..."
        rows={2}
        className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-400/50"
      />
      <div className="flex gap-2">
        <button
          onClick={() => { onApprove(notes); setNotes(""); }}
          disabled={updating}
          className="flex-1 px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          {updating ? "Processing..." : `Approve ${selectedCount}`}
        </button>
        <button
          onClick={() => {
            if (!notes.trim()) {
              alert("Please add a note explaining the rejection.");
              return;
            }
            onReject(notes);
            setNotes("");
          }}
          disabled={updating || !notes.trim()}
          className="flex-1 px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          {updating ? "Processing..." : `Reject ${selectedCount}`}
        </button>
      </div>
    </div>
  );
}
