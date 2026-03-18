import { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import FeedCard from "./FeedCard";
import type { FeedItem } from "../../types/graph";

const VISIBLE_COUNT = 5;
const ROTATE_INTERVAL_MS = 5000;

function rankFeedItems(items: FeedItem[], interests: string[]): FeedItem[] {
  const signals = items.filter((item) => item.type === "signal");
  if (interests.length === 0) return signals;
  const interestSet = new Set(interests);
  const BOOST = 1.5;
  return [...signals].sort((a, b) => {
    const aMatch = a.related_node_ids.some((id) => interestSet.has(id));
    const bMatch = b.related_node_ids.some((id) => interestSet.has(id));
    const aScore = a.impact_score * (aMatch ? BOOST : 1);
    const bScore = b.impact_score * (bMatch ? BOOST : 1);
    return bScore - aScore;
  });
}

export default function NewsFeed() {
  const { feedItems, loading } = useGraph();
  const [interests] = useState(() => getLocalPreferences().interests);
  const [offset, setOffset] = useState(0);

  const ranked = useMemo(
    () => rankFeedItems(feedItems, interests),
    [feedItems, interests]
  );

  // Auto-rotate only when there are more items than the visible window
  useEffect(() => {
    if (ranked.length <= VISIBLE_COUNT) return;
    const id = setInterval(() => {
      setOffset((prev) => (prev + 1) % ranked.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ranked.length]);

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500 text-xs">
        Loading feed...
      </div>
    );
  }

  if (ranked.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 text-xs">
        No approved signals yet. Check back soon.
      </div>
    );
  }

  // Circular slice of VISIBLE_COUNT items starting at offset
  const visible = Array.from({ length: Math.min(VISIBLE_COUNT, ranked.length) }, (_, i) => {
    return ranked[(offset + i) % ranked.length]!;
  });

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
        Latest Intelligence
      </h2>
      <div className="space-y-2 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {visible.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.35 }}
            >
              <FeedCard item={item} index={i} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
