import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../store/AuthContext";
import { voteClient } from "../../data";

interface VoteButtonProps {
  nodeId: string;
  voteUp: number;
  voteDown: number;
}

export default function VoteButton({
  nodeId,
  voteUp,
  voteDown,
}: VoteButtonProps) {
  const { user, signIn } = useAuth();
  const [userVote, setUserVote] = useState<1 | -1 | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      setUserVote(null);
      return;
    }
    voteClient.getUserVote(nodeId).then((v) => {
      setUserVote(v?.value ?? null);
    });
  }, [user, nodeId]);

  const cast = useCallback(
    async (value: 1 | -1) => {
      if (!user) {
        signIn();
        return;
      }
      setSubmitting(true);
      try {
        await voteClient.castVote(nodeId, value);
        setUserVote(value);
      } catch (err) {
        console.error("Vote failed:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [user, nodeId, signIn]
  );

  const total = voteUp + voteDown;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => cast(1)}
        disabled={submitting}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all ${
          userVote === 1
            ? "border-green-500/50 bg-green-500/10 text-green-400"
            : "border-white/10 text-gray-500 hover:border-white/30"
        }`}
      >
        ▲ {voteUp}
      </button>
      <button
        onClick={() => cast(-1)}
        disabled={submitting}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all ${
          userVote === -1
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : "border-white/10 text-gray-500 hover:border-white/30"
        }`}
      >
        ▼ {voteDown}
      </button>
      {!user && (
        <span className="text-[10px] text-gray-600">Sign in to vote</span>
      )}
      {total > 0 && (
        <span className="text-[10px] text-gray-600">{total} votes</span>
      )}
    </div>
  );
}
