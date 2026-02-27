import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";
import type { RawArticle } from "./fetcher.js";

export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  signal_type: "risk" | "solution" | "both" | "unmatched";
  risk_categories: string[];
  solution_ids: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
  proposed_topic?: string;
}

const RISK_TAXONOMY = `
Risk taxonomy for classification:
- R01: Systemic Algorithmic Discrimination (hiring, healthcare, policing bias)
- R02: Privacy Erosion via Agentic AI (data scraping, inference, prompt injection)
- R03: AI-Amplified Disinformation (deepfakes, election interference, synthetic media)
- R04: Mass Labor Displacement (job automation, economic polarization, skill obsolescence)
- R05: Autonomous Weapons (lethal AI, military AI, conflict escalation)
- R06: AI Power Concentration (Big Tech oligopoly, open-source vs closed, regulatory capture)
- R07: Environmental Cost of AI (energy consumption, water usage, e-waste, data centers)
- R08: Loss of Human Agency (cognitive atrophy, AI dependency, decision outsourcing)
- R09: AI in Surveillance (facial recognition, social scoring, authoritarian use)
- R10: Model Collapse & Data Scarcity (training data exhaustion, synthetic data loops)
`;

const SOLUTION_TAXONOMY = `
Solution taxonomy for classification:
- S01: Algorithmic Auditing & Fairness Certification Standards (addresses R01)
- S02: Privacy-Preserving AI: Federated Learning & On-Device Processing (addresses R02)
- S03: Digital Content Provenance (C2PA) Standards (addresses R03)
- S04: Universal Basic Services & AI-Era Workforce Transition Programs (addresses R04)
- S05: International AI Arms Control Treaties (addresses R05)
- S06: Open-Source AI & Antitrust Enforcement (addresses R06)
- S07: Green AI Standards & Carbon-Aware Computing (addresses R07)
- S08: Human Autonomy Frameworks & Digital Wellbeing Laws (addresses R08)
- S09: Democratic AI Oversight & Surveillance Moratoriums (addresses R09)
- S10: Synthetic Data Standards & Data Commons (addresses R10)
`;

const VALID_RISK_CODES = ["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"];
const VALID_SOLUTION_CODES = ["S01","S02","S03","S04","S05","S06","S07","S08","S09","S10"];

const SYSTEM_PROMPT = `You are a signal analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

${RISK_TAXONOMY}

${SOLUTION_TAXONOMY}

For each article provided, determine:
1. Is this article about a societal risk OR a solution/countermeasure related to AI's impact?
2. If yes, classify it.

signal_type rules:
- "risk": article is primarily about a risk, harm, or negative trend (maps to R-codes)
- "solution": article is primarily about a countermeasure, policy, or mitigation gaining traction (maps to S-codes)
- "both": article covers both a risk and a response/solution to it

Respond with a JSON array. For irrelevant articles, include them with "relevant": false.
For relevant articles, provide:
{
  "index": <number>,
  "relevant": true,
  "signal_type": "risk" | "solution" | "both",
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "risk_categories": ["R01", ...],
  "solution_ids": ["S03", ...],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>
}

For unmatched articles (relevant but outside taxonomy):
{
  "index": <number>,
  "relevant": true,
  "signal_type": "unmatched",
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "proposed_topic": "<3-8 word label describing the novel topic>",
  "risk_categories": [],
  "solution_ids": [],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>
}

Rules:
- risk_categories must be empty [] if signal_type is "solution"
- solution_ids must be empty [] if signal_type is "risk"
- Both arrays must be non-empty if signal_type is "both"
- If the article describes a genuine AI-related societal risk or solution that does NOT fit any existing R/S code, use signal_type: "unmatched" with a short proposed_topic label (3-8 words). risk_categories and solution_ids must both be empty [] for unmatched signals.
- Only include R/S codes you are confident about

For irrelevant articles:
{ "index": <number>, "relevant": false }

Only output valid JSON. No markdown fences. No explanation.`;

export interface ClassificationResult {
  signals: ClassifiedSignal[];
  tokenUsage: { input: number; output: number };
}

const BATCH_SIZE = 10;
const RELEVANCE_THRESHOLD = 0.8;

export async function classifyArticles(
  articles: RawArticle[],
  geminiApiKey: string
): Promise<ClassificationResult> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const results: ClassifiedSignal[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Process in batches
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
        systemInstruction: SYSTEM_PROMPT,
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

      const text = result.response.text();
      const parsed: Array<{
        index: number;
        relevant: boolean;
        signal_type?: "risk" | "solution" | "both" | "unmatched";
        summary?: string;
        risk_categories?: string[];
        solution_ids?: string[];
        severity_hint?: "Critical" | "Emerging" | "Horizon";
        affected_groups?: string[];
        confidence_score?: number;
        proposed_topic?: string;
      }> = JSON.parse(text);

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

        // Unmatched signals: skip taxonomy checks, require proposed_topic
        if (signalType === "unmatched") {
          const topic = item.proposed_topic ?? "";
          if (!topic) {
            logger.info(`Dropping unmatched signal with no proposed_topic: ${batch[item.index]?.title}`);
            continue;
          }
          results.push({
            title: article.title,
            summary: item.summary ?? "",
            source_url: article.url,
            source_name: article.source_name,
            published_date: article.published_date,
            signal_type: "unmatched",
            risk_categories: [],
            solution_ids: [],
            severity_hint: item.severity_hint ?? "Emerging",
            affected_groups: item.affected_groups ?? [],
            confidence_score: confidence,
            proposed_topic: topic,
          });
          continue;
        }

        const riskCats = item.risk_categories ?? [];
        const solutionIds = item.solution_ids ?? [];

        // Inline validation: drop signals with invalid taxonomy codes

        if ((signalType === "risk" || signalType === "both") && riskCats.length === 0) {
          logger.info(`Dropping signal with no risk_categories: ${batch[item.index]?.title}`);
          continue;
        }
        if ((signalType === "solution" || signalType === "both") && solutionIds.length === 0) {
          logger.info(`Dropping signal with no solution_ids: ${batch[item.index]?.title}`);
          continue;
        }
        if (riskCats.some((c) => !VALID_RISK_CODES.includes(c))) {
          logger.info(`Dropping signal with invalid risk code: ${batch[item.index]?.title}`);
          continue;
        }
        if (solutionIds.some((s) => !VALID_SOLUTION_CODES.includes(s))) {
          logger.info(`Dropping signal with invalid solution code: ${batch[item.index]?.title}`);
          continue;
        }

        results.push({
          title: article.title,
          summary: item.summary ?? "",
          source_url: article.url,
          source_name: article.source_name,
          published_date: article.published_date,
          signal_type: signalType,
          risk_categories: riskCats,
          solution_ids: solutionIds,
          severity_hint: item.severity_hint ?? "Emerging",
          affected_groups: item.affected_groups ?? [],
          confidence_score: confidence,
        });
      }

      logger.info(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${results.length} relevant signals so far`
      );
    } catch (err) {
      logger.error(`Gemini batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
      // Continue with next batch
    }
  }

  return { signals: results, tokenUsage: { input: totalInputTokens, output: totalOutputTokens } };
}
