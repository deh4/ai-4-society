// functions/src/agents/discovery/analyzer.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

export interface GraphNodeInfo {
  id: string;
  type: string;
  name: string;
  summary: string;
}

export interface SignalInfo {
  id: string;
  title: string;
  summary: string;
  signal_type: string;
  related_node_ids: string[];
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface UnmatchedSignalInfo {
  id: string;
  title: string;
  summary: string;
  proposed_topic: string;
  severity_hint: string;
  source_name: string;
  published_date: string;
}

export interface NewNodeProposal {
  proposal_type: "new_node";
  node_data: {
    type: "risk" | "solution" | "stakeholder";
    name: string;
    description: string;
    why_novel: string;
    key_themes: string[];
    suggested_parent_risk_id?: string;
  };
  supporting_signal_ids: string[];
  confidence: number;
}

export interface NewEdgeProposal {
  proposal_type: "new_edge";
  edge_data: {
    from_node: string;
    to_node: string;
    relationship: string;
    reasoning: string;
  };
  supporting_signal_ids: string[];
  confidence: number;
}

export type DiscoveryProposal = NewNodeProposal | NewEdgeProposal;

export interface PendingProposalInfo {
  name: string;
  type: string;
  description: string;
}

export interface DiscoveryResult {
  proposals: DiscoveryProposal[];
  tokenUsage: { input: number; output: number };
}

const MIN_SUPPORTING_SIGNALS = 3;

export async function analyzeSignals(
  signals: SignalInfo[],
  unmatchedSignals: UnmatchedSignalInfo[],
  nodes: GraphNodeInfo[],
  edges: Array<{ from_node: string; to_node: string; relationship: string }>,
  pendingProposals: PendingProposalInfo[],
  geminiApiKey: string,
): Promise<DiscoveryResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const nodeSection = nodes
    .map((n) => `- ${n.id} [${n.type}]: ${n.name} — ${n.summary.slice(0, 150)}`)
    .join("\n");

  const edgeSection = edges
    .map((e) => `- ${e.from_node} --[${e.relationship}]--> ${e.to_node}`)
    .join("\n");

  const pendingSection = pendingProposals.length > 0
    ? pendingProposals.map((p) => `- [${p.type}] ${p.name} — ${p.description}`).join("\n")
    : "None";

  const signalSection = signals
    .map(
      (s) =>
        `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\n` +
        `Type: ${s.signal_type} | Nodes: ${s.related_node_ids.join(",") || "none"}\n` +
        `Summary: ${s.summary}`
    )
    .join("\n\n");

  const unmatchedSection = unmatchedSignals.length > 0
    ? unmatchedSignals
        .map(
          (s) =>
            `[${s.id}] "${s.title}" (${s.source_name}, ${s.published_date})\n` +
            `Proposed topic: ${s.proposed_topic}\n` +
            `Summary: ${s.summary}`
        )
        .join("\n\n")
    : "None";

  const systemPrompt = `You are a discovery analyst for the AI 4 Society Observatory.

Your task: given a body of signals and the current graph (nodes + edges), identify:
1. Genuinely NEW topics that warrant a new node (risk, solution, or stakeholder)
2. Missing relationships between existing nodes that warrant a new edge

CURRENT GRAPH NODES:
${nodeSection}

CURRENT GRAPH EDGES:
${edgeSection || "No edges yet."}

ALREADY-PENDING PROPOSALS (do NOT re-propose these):
${pendingSection}

Rules for new_node proposals:
- Must NOT be a sub-variant or reframing of an existing node
- Must NOT overlap with pending proposals
- Must be supported by at least ${MIN_SUPPORTING_SIGNALS} signals
- Must represent a distinct societal risk, solution, or affected stakeholder group
- For stakeholder proposals: propose when a distinct affected group appears across multiple signals
- For solution proposals: include suggested_parent_risk_id if a clear parent risk exists

Rules for new_edge proposals:
- The edge must connect two EXISTING nodes (use valid node IDs)
- The relationship must not already exist in the current graph edges
- Valid relationship types: "correlates_with", "addressed_by", "impacts", "amplifies", "depends_on"
- Must be supported by at least 2 signals showing the relationship

Respond with a JSON array of proposals (can be empty []):

For new nodes:
{
  "proposal_type": "new_node",
  "node_data": {
    "type": "risk" | "solution" | "stakeholder",
    "name": "<concise name>",
    "description": "<2-3 sentence description>",
    "why_novel": "<1-2 sentences explaining why not covered by existing nodes>",
    "key_themes": ["<theme1>", "<theme2>"],
    "suggested_parent_risk_id": "<node ID or omit>"
  },
  "supporting_signal_ids": ["<id1>", "<id2>", ...],
  "confidence": <0.0-1.0>
}

For new edges:
{
  "proposal_type": "new_edge",
  "edge_data": {
    "from_node": "<existing node ID>",
    "to_node": "<existing node ID>",
    "relationship": "correlates_with" | "addressed_by" | "impacts" | "amplifies" | "depends_on",
    "reasoning": "<1 sentence explaining why this relationship exists>"
  },
  "supporting_signal_ids": ["<id1>", "<id2>", ...],
  "confidence": <0.0-1.0>
}

Only output valid JSON array. No markdown. No explanation outside JSON.`;

  const prompt = `CLASSIFIED SIGNALS (last 30 days):\n\n${signalSection}\n\nUNMATCHED SIGNALS (potential novel topics):\n\n${unmatchedSection}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const usage = result.response.usageMetadata;
    const tokenUsage = {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    };

    const parsed: DiscoveryProposal[] = JSON.parse(result.response.text());

    // Validate proposals
    const validSignalIds = new Set([
      ...signals.map((s) => s.id),
      ...unmatchedSignals.map((s) => s.id),
    ]);
    const validNodeIds = new Set(nodes.map((n) => n.id));

    const filtered = parsed.filter((p) => {
      // Validate signal references
      const validRefs = p.supporting_signal_ids.filter((id) => validSignalIds.has(id));

      if (p.proposal_type === "new_node") {
        if (validRefs.length < MIN_SUPPORTING_SIGNALS) {
          logger.info(`Discovery: dropping new_node "${p.node_data.name}" — only ${validRefs.length} valid signal refs`);
          return false;
        }
        p.supporting_signal_ids = validRefs;
        return true;
      }

      if (p.proposal_type === "new_edge") {
        // Validate both node IDs exist
        if (!validNodeIds.has(p.edge_data.from_node) || !validNodeIds.has(p.edge_data.to_node)) {
          logger.info(`Discovery: dropping new_edge — invalid node IDs`);
          return false;
        }
        if (validRefs.length < 2) {
          logger.info(`Discovery: dropping new_edge — only ${validRefs.length} valid signal refs`);
          return false;
        }
        p.supporting_signal_ids = validRefs;
        return true;
      }

      return false;
    });

    logger.info(`Discovery: ${parsed.length} proposals from Gemini, ${filtered.length} passed validation`);
    return { proposals: filtered, tokenUsage };
  } catch (err) {
    logger.error("Discovery Agent v2 Gemini call failed:", err);
    return { proposals: [], tokenUsage: { input: 0, output: 0 } };
  }
}
