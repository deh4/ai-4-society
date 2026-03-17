import { useMemo, useState } from "react";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import FeedCard from "./FeedCard";
import type { FeedItem } from "../../types/graph";

function rankFeedItems(items: FeedItem[], interests: string[]): FeedItem[] {
  if (interests.length === 0) return items;

  const interestSet = new Set(interests);
  const BOOST = 1.5;

  return [...items].sort((a, b) => {
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

  const ranked = useMemo(
    () => rankFeedItems(feedItems, interests),
    [feedItems, interests]
  );

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
        No feed items yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
        Latest Intelligence
      </h2>
      <div className="space-y-2">
        {ranked.map((item, i) => (
          <FeedCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}
