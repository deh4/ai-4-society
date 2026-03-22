// src/components/landing/FeaturedStory.tsx
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import { toSlug } from "../../lib/slugs";
import ShareStrip from "./ShareStrip";
import HalftoneMask from "./HalftoneMask";

const AUTO_ADVANCE_MS = 8000;

export default function FeaturedStory() {
  const { snapshot, editorialHooks } = useGraph();
  const [activeIndex, setActiveIndex] = useState(0);
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

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

  const hasImage = hook.image_url && !imgErrors.has(hook.id);

  return (
    <section className="py-8 relative">
      <HalftoneMask />

      <AnimatePresence mode="wait">
        <motion.div
          key={hook.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
          {/* Background image with halftone mask */}
          {hasImage && (
            <div className="absolute inset-0 -mx-4 -my-2 overflow-hidden rounded-xl">
              <img
                src={hook.image_url!}
                alt=""
                onError={() => setImgErrors((s) => new Set(s).add(hook.id))}
                className="w-full h-full object-cover"
                style={{
                  mask: "url(#halftone-mask)",
                  WebkitMask: "url(#halftone-mask)",
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                }}
              />
              {/* Dark gradient overlay for text contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/80 to-transparent" />
            </div>
          )}

          {/* Existing content (positioned above image) */}
          <div className="relative z-10">
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
            <div className="text-sm leading-relaxed mb-6">
              <span className="text-white font-semibold">What this means: </span>
              <span className="text-gray-300">{hook.hook_text}</span>
            </div>

            {/* Evidence cards — fixed height for consistent layout */}
            {parentNode && (
              <div className="flex gap-2 mb-6">
                <div className="flex-1 h-20 sm:h-24 p-3 bg-red-500/5 rounded-lg border-l-2 border-red-500 flex flex-col justify-center">
                  <div className="text-[8px] text-gray-600 uppercase tracking-wider">
                    {parentNode.type === "risk" ? "Risk Score" : "Adoption Score"}
                  </div>
                  <div className="text-xl font-bold text-red-400 mt-1">
                    {Math.round(score)}
                  </div>
                </div>
                <div className="flex-1 h-20 sm:h-24 p-3 bg-blue-500/5 rounded-lg border-l-2 border-blue-500 flex flex-col justify-center">
                  <div className="text-[8px] text-gray-600 uppercase tracking-wider">Velocity</div>
                  <div className="text-xl font-bold text-blue-400 mt-1">
                    {velocity ?? "—"}
                  </div>
                </div>
                <div className="flex-1 h-20 sm:h-24 p-3 bg-green-500/5 rounded-lg border-l-2 border-green-500 flex flex-col justify-center">
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

            {/* CTA */}
            <div className="text-center">
              <Link
                to={observatoryUrl}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
              >
                Read more →
              </Link>
            </div>
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
