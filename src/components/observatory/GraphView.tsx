import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import { useGraph } from "../../store/GraphContext";
import { getLocalPreferences } from "../../lib/preferences";
import type { NodeType, GraphSnapshot } from "../../types/graph";

interface GraphViewProps {
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  activeTypes: Set<NodeType>;
  activePrinciples?: Set<string>;
}

interface ForceNode {
  id: string;
  name: string;
  type: NodeType;
  val: number;
  color: string;
  isPreference: boolean;
  isOrphan: boolean;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

const TYPE_COLORS: Record<NodeType, string> = {
  risk: "#ef4444",
  solution: "#22c55e",
  stakeholder: "#3b82f6",
  milestone: "#eab308",
  principle: "#a855f7",
};

function buildGraphData(
  snapshot: GraphSnapshot,
  activeTypes: Set<NodeType>,
  preferenceIds: Set<string>,
  activePrinciples?: Set<string>
): { nodes: ForceNode[]; links: GraphLink[] } {
  const nodeIds = new Set<string>();

  const activeNodes = snapshot.nodes.filter((n) => {
    if (!activeTypes.has(n.type)) return false;
    // If principle filters are active, only show nodes that have at least one matching principle
    if (activePrinciples && activePrinciples.size > 0) {
      const nodePrinciples = n.principles ?? [];
      return nodePrinciples.some((p) => activePrinciples.has(p));
    }
    return true;
  });
  activeNodes.forEach((n) => nodeIds.add(n.id));

  const links: GraphLink[] = snapshot.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      source: e.from,
      target: e.to,
      relationship: e.relationship,
    }));

  // Track which nodes have at least one edge so orphans can be styled differently
  const connectedIds = new Set<string>();
  for (const link of links) {
    connectedIds.add(link.source);
    connectedIds.add(link.target);
  }

  const nodes: ForceNode[] = activeNodes.map((n) => {
    const isPreference = preferenceIds.has(n.id);
    const isOrphan = !connectedIds.has(n.id);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      val: isPreference ? 6 : isOrphan ? 1.5 : 3,
      color: TYPE_COLORS[n.type],
      isPreference,
      isOrphan,
    };
  });

  return { nodes, links };
}

export default function GraphView({
  selectedNodeId,
  onSelectNode,
  activeTypes,
  activePrinciples,
}: GraphViewProps) {
  const { snapshot, loading } = useGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<NodeObject<ForceNode>>>(undefined);
  const selectedNodeRef = useRef<string | null>(null);
  selectedNodeRef.current = selectedNodeId;
  const hasInitialLayoutRef = useRef(false);
  // Start at 0 so the canvas never renders wider than its container before
  // ResizeObserver fires. An 800px default on a 375px phone causes immediate
  // horizontal overflow.
  const [dimensions, setDimensions] = useState({ width: 0, height: 600 });

  // Stable ref — localStorage doesn't change during a session, so we read once.
  const preferenceIds = useMemo(
    () => new Set(getLocalPreferences().interests),
    []
  );

  const graphData = useMemo(() => {
    if (!snapshot) return { nodes: [], links: [] };
    return buildGraphData(snapshot, activeTypes, preferenceIds, activePrinciples);
  }, [snapshot, activeTypes, preferenceIds, activePrinciples]);

  // Resize observer — also reads the initial size synchronously so there is
  // no flash before the first ResizeObserver callback.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      setDimensions({ width: rect.width, height: rect.height || 600 });
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Center graph on selected node when selection changes externally
  useEffect(() => {
    if (!selectedNodeId || !fgRef.current || !hasInitialLayoutRef.current) return;
    const node = graphData.nodes.find((n) => n.id === selectedNodeId) as unknown as { x?: number; y?: number } | undefined;
    if (node?.x !== undefined && node?.y !== undefined) {
      fgRef.current.centerAt(node.x, node.y, 300);
    }
  }, [selectedNodeId, graphData.nodes]);

  const handleNodeClick = useCallback(
    (node: NodeObject<ForceNode>) => {
      if (node.id) onSelectNode(String(node.id));
    },
    [onSelectNode]
  );

  const handleEngineStop = useCallback(() => {
    if (!hasInitialLayoutRef.current && fgRef.current) {
      hasInitialLayoutRef.current = true;
      // Center on selected node if one exists
      const selId = selectedNodeRef.current;
      if (selId) {
        const node = graphData.nodes.find((n) => n.id === selId);
        if (node) {
          fgRef.current.centerAt((node as unknown as { x: number }).x, (node as unknown as { y: number }).y, 400);
          fgRef.current.zoom(3, 400);
          fgRef.current.d3Force("charge", null);
          fgRef.current.d3Force("link", null);
          fgRef.current.d3Force("center", null);
          return;
        }
      }
      fgRef.current.zoom(2.5, 400);
      fgRef.current.d3Force("charge", null);
      fgRef.current.d3Force("link", null);
      fgRef.current.d3Force("center", null);
    }
  }, [graphData.nodes]);

  const handlePointerAreaPaint = useCallback(
    (node: NodeObject<ForceNode>, color: string, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const getLinkColor = useCallback(() => "rgba(255,255,255,0.3)", []);

  const getLinkLabel = useCallback(
    (link: object) => (link as unknown as GraphLink).relationship,
    []
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paintNode = useCallback(
    (node: NodeObject<ForceNode>, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isSelected = node.id === selectedNodeRef.current;
      const isOrphan = node.isOrphan;
      const radius = node.isPreference ? 6 : isSelected ? 7 : isOrphan ? 2 : 4;

      // Orphan nodes (no edges yet) render as small, dim dots — still clickable
      // but don't dominate the canvas visually
      if (isOrphan && !isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = (node.color ?? "#ffffff") + "40"; // 25% opacity
        ctx.fill();
        return;
      }

      // Glow for selected/preference nodes
      if (isSelected || node.isPreference) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
        ctx.fillStyle =
          (node.color ?? "#ffffff") + (isSelected ? "60" : "30");
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? "#ffffff" : (node.color ?? "#ffffff");
      ctx.fill();

      // Labels for all nodes
      const name = node.name ?? "";
      const type = node.type;

      if (isSelected) {
        // Selected: full name, bright white, slightly larger
        const label = name.length > 24 ? name.slice(0, 22) + "…" : name;
        ctx.font = `bold 4px Inter, sans-serif`;
        ctx.textAlign = "center";
        // Subtle background pill for readability
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x - tw / 2 - 1.5, y + radius + 2, tw + 3, 5.5);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x, y + radius + 6.5);
      } else if (type === "risk" || type === "solution" || type === "milestone") {
        // Key nodes: always labeled, truncated
        const label = name.length > 18 ? name.slice(0, 16) + "…" : name;
        ctx.font = "3px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle =
          type === "risk"
            ? "rgba(239,68,68,0.85)"
            : type === "solution"
              ? "rgba(34,197,94,0.85)"
              : "rgba(234,179,8,0.75)";
        ctx.fillText(label, x, y + radius + 4.5);
      } else {
        // Stakeholders: first word only, dim
        const firstWord = name.split(" ")[0] ?? name;
        const label = firstWord.length > 12 ? firstWord.slice(0, 10) + "…" : firstWord;
        ctx.font = "2.5px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(148,163,184,0.55)";
        ctx.fillText(label, x, y + radius + 4);
      }
    },
    // Re-create callback when selectedNodeId changes so canvas repaints highlights
    [selectedNodeId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <span className="text-gray-500 text-xs animate-pulse">
          Loading graph...
        </span>
      </div>
    );
  }

  if (!snapshot || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <span className="text-gray-500 text-xs">
          No graph data available yet.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative rounded-lg border border-white/10 bg-black/50 overflow-hidden h-[25vh] lg:h-[calc(100vh-220px)]"
        style={{ minHeight: 180 }}
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={handlePointerAreaPaint}
          onNodeClick={handleNodeClick}
          linkColor={getLinkColor}
          linkWidth={1}
          linkLabel={getLinkLabel}
          backgroundColor="transparent"
          cooldownTicks={100}
          onEngineStop={handleEngineStop}
        />
      </div>
    </div>
  );
}
