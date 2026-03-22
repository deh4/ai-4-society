// src/components/landing/FeaturedStory.tsx
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { toSlug } from "../../lib/slugs";
import ShareStrip from "./ShareStrip";

const AUTO_ADVANCE_MS = 8000;

export default function FeaturedStory() {
  const { snapshot, editorialHooks } = useGraph();
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-advance
  useEffect(() => {
    if (editorialHooks.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % editorialHooks.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [editorialHooks.length]);

  const goTo = useCallback((i: number) => setActiveIndex(i), []);

  if (!snapshot || editorialHooks.length === 0) return null;

  const hook = editorialHooks[activeIndex];
  if (!hook) return null;

  // Join with graph snapshot for evidence
  const parentNodeId = hook.related_node_ids[0];
  const parentNode = parentNodeId
    ? snapshot.nodes.find((n) => n.id === parentNodeId)
    : null;

  // GraphSnapshot uses score_2026 for both risk and solution nodes
  const score = parentNode?.score_2026 ?? 0;

  const velocity = parentNode?.velocity ?? parentNode?.implementation_stage ?? null;

  // Count solutions connected to this risk
  const solutionCount = parentNode?.type === "risk"
    ? snapshot.edges.filter(
        (e) =>
          (e.from === parentNodeId || e.to === parentNodeId) &&
          snapshot.nodes.find(
            (n) => n.id === (e.from === parentNodeId ? e.to : e.from) && n.type === "solution"
          )
      ).length
    : 0;

  const observatoryUrl = parentNode
    ? `/observatory/${toSlug(parentNode.name)}`
    : "/observatory";

  const shareUrl = parentNode
    ? `https://ai4society.io/observatory/${toSlug(parentNode.name)}`
    : "https://ai4society.io";

  return (
    <section className="py-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={hook.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {/* Velocity tag + signal freshness */}
          <div className="flex items-center gap-2 mb-4">
            {velocity && (
              <span className="text-[9px] uppercase tracking-widest text-red-400 border border-red-400/30 px-2 py-0.5 rounded">
                {velocity}
              </span>
            )}
            <span className="text-[9px] text-gray-600">
              · {hook.source_name} · Credibility: {(hook.source_credibility * 100).toFixed(0)}%
            </span>
          </div>

          {/* Real signal headline */}
          <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-tight mb-3">
            {hook.signal_title}
          </h1>

          {/* Editorial hook */}
          <div className="text-sm text-gray-400 leading-relaxed mb-6">
            <span className="text-gray-500 font-medium">What this means: </span>
            {hook.hook_text}
          </div>

          {/* Evidence cards — always show all 3 for consistent layout */}
          {parentNode && (
            <div className="flex gap-2 mb-6">
              <div className="flex-1 p-3 bg-red-500/5 rounded-lg border-l-2 border-red-500">
                <div className="text-[8px] text-gray-600 uppercase tracking-wider">
                  {parentNode.type === "risk" ? "Risk Score" : "Adoption Score"}
                </div>
                <div className="text-xl font-bold text-red-400 mt-1">
                  {Math.round(score)}
                </div>
              </div>
              <div className="flex-1 p-3 bg-blue-500/5 rounded-lg border-l-2 border-blue-500">
                <div className="text-[8px] text-gray-600 uppercase tracking-wider">Velocity</div>
                <div className="text-xl font-bold text-blue-400 mt-1">
                  {velocity ?? "—"}
                </div>
              </div>
              <div className="flex-1 p-3 bg-green-500/5 rounded-lg border-l-2 border-green-500">
                <div className="text-[8px] text-gray-600 uppercase tracking-wider">Solutions</div>
                <div className="text-xl font-bold text-green-400 mt-1">{solutionCount}</div>
                <div className="text-[8px] text-gray-600">
                  {solutionCount === 0 ? "None yet" : "Being tracked"}
                </div>
              </div>
            </div>
          )}

          {/* Share strip */}
          <div className="mb-6">
            <ShareStrip headline={hook.signal_title} url={shareUrl} />
          </div>

          {/* CTAs */}
          <div className="flex gap-3">
            <Link
              to={observatoryUrl}
              className="text-sm px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors"
            >
              Read the full picture
            </Link>
            <Link
              to="/observatory"
              className="text-sm px-5 py-2.5 border border-white/10 text-gray-400 rounded-lg hover:text-white hover:border-white/20 transition-colors"
            >
              All risks →
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Swipe dots */}
      {editorialHooks.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-6">
          {editorialHooks.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-[3px] rounded-full transition-all ${
                i === activeIndex
                  ? "w-5 bg-blue-500"
                  : "w-2 bg-white/15 hover:bg-white/30"
              }`}
              aria-label={`Story ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
