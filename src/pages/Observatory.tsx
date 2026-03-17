import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Layout from "../components/shared/Layout";
import GraphView from "../components/observatory/GraphView";
import DetailPanel from "../components/observatory/DetailPanel";
import ObservatoryTimeline from "../components/observatory/ObservatoryTimeline";
import { useGraph } from "../store/GraphContext";

type Tab = "graph" | "timeline";

export default function Observatory() {
  const { nodeId: urlNodeId } = useParams<{ nodeId?: string }>();
  const navigate = useNavigate();
  const { snapshot, loading } = useGraph();
  const [activeTab, setActiveTab] = useState<Tab>("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    urlNodeId ?? null
  );

  // Sync URL param to state
  useEffect(() => {
    if (urlNodeId) setSelectedNodeId(urlNodeId);
  }, [urlNodeId]);

  const handleSelectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id);
      if (id) {
        navigate(`/observatory/${id}`, { replace: true });
      } else {
        navigate("/observatory", { replace: true });
      }
    },
    [navigate]
  );

  const handleNavigateNode = useCallback(
    (id: string) => {
      setSelectedNodeId(id);
      navigate(`/observatory/${id}`, { replace: true });
    },
    [navigate]
  );

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold">Observatory</h1>
            {snapshot && (
              <p className="text-xs text-gray-500">
                {snapshot.nodeCount} nodes · {snapshot.edgeCount} edges
              </p>
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
          <GraphView
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        )}

        {!loading && activeTab === "timeline" && (
          <ObservatoryTimeline onSelectNode={handleNavigateNode} />
        )}
      </div>

      {/* Detail Panel (overlay) */}
      <AnimatePresence>
        {selectedNodeId && (
          <DetailPanel
            key={selectedNodeId}
            nodeId={selectedNodeId}
            onClose={() => handleSelectNode(null)}
            onNavigate={handleNavigateNode}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
