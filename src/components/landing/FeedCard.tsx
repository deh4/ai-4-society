import { motion } from "framer-motion";
import type { FeedItem } from "../../types/graph";

interface FeedCardProps {
  item: FeedItem;
  index: number;
}

function credibilityLabel(score: number): { text: string; color: string } {
  if (score >= 0.8) return { text: "High", color: "text-green-400" };
  if (score >= 0.6) return { text: "Med", color: "text-yellow-400" };
  return { text: "Low", color: "text-gray-500" };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function FeedCard({ item, index }: FeedCardProps) {
  const isMilestone = item.type === "milestone";
  const cred = item.source_credibility
    ? credibilityLabel(item.source_credibility)
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`rounded-lg border p-4 transition-colors ${
        isMilestone
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-[10px] uppercase tracking-wider font-medium ${
            isMilestone ? "text-yellow-400" : "text-[var(--accent-structural)]"
          }`}
        >
          {isMilestone ? "⬢ Milestone" : "Signal"}
        </span>
        {item.published_date && (
          <span className="text-[10px] text-gray-600">
            {timeAgo(item.published_date)}
          </span>
        )}
      </div>
      <h3 className="text-sm font-semibold mb-1 leading-snug">{item.title}</h3>
      <p className="text-xs text-gray-400 mb-3 line-clamp-2">{item.summary}</p>
      <div className="flex items-center justify-between">
        {item.source_name && (
          <span className="text-[10px] text-gray-500">{item.source_name}</span>
        )}
        {cred && (
          <span className={`text-[10px] ${cred.color}`}>{cred.text}</span>
        )}
      </div>
    </motion.article>
  );
}
