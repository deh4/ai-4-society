import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Layout from "../components/shared/Layout";
import GraphView from "../components/observatory/GraphView";
import DetailPanel from "../components/observatory/DetailPanel";
import ObservatoryTimeline from "../components/observatory/ObservatoryTimeline";
import NodeTypeFilter from "../components/observatory/NodeTypeFilter";
import { useGraph } from "../store/GraphContext";
import { toSlug } from "../lib/slugs";
import type { NodeType } from "../types/graph";

type Tab = "graph" | "timeline";

export default function Observatory() {
  const { nodeId: urlParam } = useParams<{ nodeId?: string }>();
  const { snapshot, loading } = useGraph();
  const [activeTab, setActiveTab] = useState<Tab>("graph");
  // selectedNodeId is always the Firestore document ID (never a slug)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const autoSelectedRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(
    () => new Set<NodeType>(["risk", "solution", "stakeholder", "milestone"])
  );

  // Resolve URL param (slug or legacy Firestore ID) → Firestore node ID.
  // Runs whenever the URL param or snapshot changes.
  useEffect(() => {
    if (!urlParam || !snapshot) return;
    // Try slug match first (new-style URLs)
    const bySlug = snapshot.nodes.find((n) => toSlug(n.name) === urlParam);
    if (bySlug) { setSelectedNodeId(bySlug.id); return; }
    // Fall back to direct ID match (legacy links / shared URLs with old format)
    const byId = snapshot.nodes.find((n) => n.id === urlParam);
    if (byId) {
      // Silently upgrade the URL to the slug form
      setSelectedNodeId(byId.id);
      window.history.replaceState(null, "", `/observatory/${toSlug(byId.name)}`);
    }
  }, [urlParam, snapshot]);

  // Auto-select the first risk node when no URL param is present
  useEffect(() => {
    if (autoSelectedRef.current || !snapshot || selectedNodeId || urlParam) return;
    const firstRisk = snapshot.nodes.find((n) => n.type === "risk");
    if (firstRisk) {
      autoSelectedRef.current = true;
      setSelectedNodeId(firstRisk.id);
      window.history.replaceState(null, "", `/observatory/${toSlug(firstRisk.name)}`);
    }
  }, [snapshot, selectedNodeId, urlParam]);

  // Stable callbacks — use snapshotRef so we don't add snapshot to deps
  // (which would give GraphView a new onSelectNode reference on every snapshot update)
  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id && snapshotRef.current) {
      const node = snapshotRef.current.nodes.find((n) => n.id === id);
      const slug = node ? toSlug(node.name) : id;
      window.history.replaceState(null, "", `/observatory/${slug}`);
    } else {
      window.history.replaceState(null, "", "/observatory");
    }
  }, []);

  const handleNavigateNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    if (snapshotRef.current) {
      const node = snapshotRef.current.nodes.find((n) => n.id === id);
      const slug = node ? toSlug(node.name) : id;
      window.history.replaceState(null, "", `/observatory/${slug}`);
    }
  }, []);

  const selectedNode = useMemo(
    () => snapshot?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [snapshot, selectedNodeId]
  );

  const pageTitle = selectedNode
    ? `${selectedNode.name} — AI 4 Society Observatory`
    : "Observatory — AI 4 Society";

  const pageDescription = selectedNode
    ? `Explore ${selectedNode.name}: a ${selectedNode.type} tracked by the AI 4 Society Observatory. Real-time signals, expert analysis, and connections to related risks and solutions.`
    : "Explore the live AI risk and solution knowledge graph. Track 40+ risks, solutions, stakeholders and milestones as AI reshapes society.";

  const canonicalUrl = selectedNode
    ? `https://ai4society.io/observatory/${toSlug(selectedNode.name)}`
    : "https://ai4society.io/observatory";

  return (
    <Layout>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
      </Helmet>
      <div className="max-w-7xl mx-auto px-4 py-4 overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div>
              <h1 className="text-xl font-bold">Observatory</h1>
              {snapshot && (
                <p className="text-xs text-gray-500">
                  {snapshot.nodeCount} nodes · {snapshot.edgeCount} edges
                </p>
              )}
            </div>
            {activeTab === "graph" && (
              <NodeTypeFilter active={activeTypes} onChange={setActiveTypes} />
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            {(["graph", "timeline"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs px-4 py-1.5 rounded transition-all ${
                  activeTab === tab
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                {tab === "graph" ? "Graph" : "Timeline"}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-96">
            <span className="text-gray-500 text-xs animate-pulse">
              Loading observatory...
            </span>
          </div>
        )}

        {/* Tab content */}
        {!loading && activeTab === "graph" && (
          <div className="lg:grid lg:grid-cols-[3fr_2fr] gap-4">
            <div className="min-w-0">
              <GraphView
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
                activeTypes={activeTypes}
              />
            </div>

            {/* Desktop inline panel — lg+ only */}
            <div className="hidden lg:block min-w-0">
              <AnimatePresence>
                {selectedNodeId && (
                  <DetailPanel
                    key={`inline-${selectedNodeId}`}
                    nodeId={selectedNodeId}
                    onClose={() => handleSelectNode(null)}
                    onNavigate={handleNavigateNode}
                    inline
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {!loading && activeTab === "timeline" && (
          <ObservatoryTimeline onSelectNode={handleNavigateNode} />
        )}
      </div>

      {/* Mobile/tablet overlay panel — hidden on lg */}
      <AnimatePresence>
        {selectedNodeId && (
          <div className="lg:hidden">
            <DetailPanel
              key={`overlay-${selectedNodeId}`}
              nodeId={selectedNodeId}
              onClose={() => handleSelectNode(null)}
              onNavigate={handleNavigateNode}
            />
          </div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
