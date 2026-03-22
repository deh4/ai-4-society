// functions/src/agents/signal-scout/classifier.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";
import type { RawArticle } from "../../signal-scout/fetcher.js";

export interface RelatedNode {
  node_id: string;
  node_type: "risk" | "solution" | "stakeholder" | "milestone";
  relevance: number; // 0-1
}

export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type: "risk" | "solution" | "both" | "unmatched";
  related_nodes: RelatedNode[];
  related_node_ids: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
  proposed_topic?: string;
  harm_status: "incident" | "hazard" | null;
  principles: string[];
  image_url?: string;
}

export interface ClassificationResult {
  signals: ClassifiedSignal[];
  tokenUsage: { input: number; output: number };
}

interface GraphNodeInfo {
  id: string;
  type: string;
  name: string;
  summary: string;
}

const BATCH_SIZE = 25;
const RELEVANCE_THRESHOLD = 0.6;

function buildSystemPrompt(nodes: GraphNodeInfo[]): string {
  const riskNodes = nodes.filter((n) => n.type === "risk");
  const solutionNodes = nodes.filter((n) => n.type === "solution");
  const stakeholderNodes = nodes.filter((n) => n.type === "stakeholder");

  const riskTaxonomy = riskNodes.length > 0
    ? riskNodes.map((n) => `- ${n.id}: ${n.name} (${n.summary.slice(0, 100)})`).join("\n")
    : "No risk nodes in the graph yet.";

  const solutionTaxonomy = solutionNodes.length > 0
    ? solutionNodes.map((n) => `- ${n.id}: ${n.name} (${n.summary.slice(0, 100)})`).join("\n")
    : "No solution nodes in the graph yet.";

  const stakeholderList = stakeholderNodes.length > 0
    ? stakeholderNodes.map((n) => `- ${n.id}: ${n.name}`).join("\n")
    : "No stakeholder nodes in the graph yet.";

  return `You are a signal analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

RISK NODES (current graph):
${riskTaxonomy}

SOLUTION NODES (current graph):
${solutionTaxonomy}

STAKEHOLDER NODES (current graph):
${stakeholderList}

For each article provided, determine:
1. Is this article about a societal risk OR a solution/countermeasure related to AI's impact?
2. If yes, classify it against the graph nodes above.

signal_type rules:
- "risk": article is primarily about a risk, harm, or negative trend
- "solution": article is primarily about a countermeasure, policy, or mitigation
- "both": article covers both a risk and a response/solution
- "unmatched": article is relevant to AI society impact but does NOT fit any existing node

Additionally, determine harm_status for each article:
- "incident": The article describes an AI-related harm that HAS ALREADY OCCURRED.
  Evidence: past tense, specific victims/damages, legal proceedings, documented failures.
- "hazard": The article describes a PLAUSIBLE FUTURE harm or near-miss.
  Evidence: warnings, risk assessments, "could lead to", vulnerability disclosures.
- null: The article is about a solution, policy, or does not describe a specific harm.
  Use null for solution-type signals unless they reference a specific past incident.

PRINCIPLES (tag 1-3 most relevant per signal, use [] if none apply):
- P01: Accountability — responsible parties, liability, oversight gaps
- P02: Fairness — bias, discrimination, equitable access
- P03: Transparency — explainability, black-box, interpretability
- P04: Safety — robustness, reliability, failure modes
- P05: Privacy — surveillance, data collection, consent
- P06: Human Oversight — autonomy, human-in-the-loop, automation
- P07: Sustainability — environmental impact, energy, resources
- P08: Wellbeing — mental health, social impact, quality of life
- P09: Democracy — elections, free speech, information integrity
- P10: International Cooperation — cross-border, standards, treaties

For relevant articles (matched to existing nodes):
{
  "index": <number>,
  "relevant": true,
  "signal_type": "risk" | "solution" | "both",
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "related_nodes": [
    { "node_id": "<ID>", "node_type": "risk" | "solution" | "stakeholder", "relevance": <0.0-1.0> }
  ],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>,
  "harm_status": "incident" | "hazard" | null,
  "principles": ["P01", "P03"]
}

For unmatched articles (relevant but outside current graph):
{
  "index": <number>,
  "relevant": true,
  "signal_type": "unmatched",
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "proposed_topic": "<3-8 word label describing the novel topic>",
  "related_nodes": [],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>,
  "harm_status": "incident" | "hazard" | null,
  "principles": ["P01", "P03"]
}

For irrelevant articles:
{ "index": <number>, "relevant": false }

Rules:
- related_nodes must reference valid node IDs from the graph above
- Each related_node needs a relevance score (0-1) indicating how strongly this article relates
- For "unmatched" signals, related_nodes must be empty [] and proposed_topic is required
- Only include node references you are confident about
- Prefer specific nodes over broad matches

Only output valid JSON array. No markdown fences. No explanation.`;
}

export async function classifyArticles(
  articles: RawArticle[],
  nodes: GraphNodeInfo[],
  geminiApiKey: string,
): Promise<ClassificationResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const systemPrompt = buildSystemPrompt(nodes);

  // Build set of valid node IDs for validation
  const validNodeIds = new Set(nodes.map((n) => n.id));

  const results: ClassifiedSignal[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const articleList = batch
      .map(
        (a, idx) =>
          `[${idx}] Title: ${a.title}\nSource: ${a.source_name}\nDate: ${a.published_date}\nSnippet: ${a.snippet ?? "N/A"}`
      )
      .join("\n\n");

    const prompt = `Classify these articles:\n\n${articleList}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const usage = result.response.usageMetadata;
      if (usage) {
        totalInputTokens += usage.promptTokenCount ?? 0;
        totalOutputTokens += usage.candidatesTokenCount ?? 0;
      }

      const parsed: Array<{
        index: number;
        relevant: boolean;
        signal_type?: "risk" | "solution" | "both" | "unmatched";
        summary?: string;
        related_nodes?: RelatedNode[];
        severity_hint?: "Critical" | "Emerging" | "Horizon";
        affected_groups?: string[];
        confidence_score?: number;
        proposed_topic?: string;
        harm_status?: "incident" | "hazard" | null;
        principles?: string[];
      }> = JSON.parse(result.response.text());

      const relevantCount = parsed.filter((i) => i.relevant).length;
      const irrelevantCount = parsed.length - relevantCount;
      if (irrelevantCount > 0) {
        logger.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${irrelevantCount}/${parsed.length} marked irrelevant by Gemini`);
      }

      for (const item of parsed) {
        if (!item.relevant) continue;
        const confidence = item.confidence_score ?? 0.5;
        if (confidence < RELEVANCE_THRESHOLD) {
          logger.info(`Skipping low-confidence signal (${confidence.toFixed(2)}): ${batch[item.index]?.title}`);
          continue;
        }
        const article = batch[item.index];
        if (!article) continue;

        const signalType = item.signal_type ?? "risk";

        // Validate harm_status and principles
        const validHarmStatuses = new Set(["incident", "hazard"]);
        const harmStatus = item.harm_status && validHarmStatuses.has(item.harm_status) ? item.harm_status : null;
        const validPrincipleIds = new Set(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10"]);
        const principles = (item.principles ?? []).filter((p) => validPrincipleIds.has(p));

        // Unmatched: require proposed_topic, skip taxonomy checks
        if (signalType === "unmatched") {
          const topic = item.proposed_topic ?? "";
          if (!topic) {
            logger.info(`Dropping unmatched signal with no proposed_topic: ${article.title}`);
            continue;
          }
          results.push({
            title: article.title,
            summary: item.summary ?? "",
            source_url: article.url,
            source_name: article.source_name,
            published_date: article.published_date,
            signal_type: "unmatched",
            related_nodes: [],
            related_node_ids: [],
            severity_hint: item.severity_hint ?? "Emerging",
            affected_groups: item.affected_groups ?? [],
            confidence_score: confidence,
            proposed_topic: topic,
            harm_status: harmStatus,
            principles,
            image_url: article.image_url,
          });
          continue;
        }

        // Validate and filter related_nodes to only valid node IDs
        const rawRelated = item.related_nodes ?? [];
        const validRelated = rawRelated.filter((rn) => validNodeIds.has(rn.node_id));

        if (validRelated.length === 0) {
          logger.info(`Dropping signal with no valid related_nodes: ${article.title}`);
          continue;
        }

        results.push({
          title: article.title,
          summary: item.summary ?? "",
          source_url: article.url,
          source_name: article.source_name,
          published_date: article.published_date,
          signal_type: signalType,
          related_nodes: validRelated,
          related_node_ids: validRelated.map((rn) => rn.node_id),
          severity_hint: item.severity_hint ?? "Emerging",
          affected_groups: item.affected_groups ?? [],
          confidence_score: confidence,
          harm_status: harmStatus,
          principles,
          image_url: article.image_url,
        });
      }

      logger.info(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${results.length} relevant signals so far`
      );
    } catch (err) {
      logger.error(`Gemini batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
    }
  }

  return { signals: results, tokenUsage: { input: totalInputTokens, output: totalOutputTokens } };
}
