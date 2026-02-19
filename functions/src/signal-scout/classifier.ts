import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";
import type { RawArticle } from "./fetcher.js";

export interface ClassifiedSignal {
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  published_date: string;
  risk_categories: string[];
  severity_hint: "Critical" | "Emerging" | "Horizon";
  affected_groups: string[];
  confidence_score: number;
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

const SYSTEM_PROMPT = `You are a signal analyst for the AI 4 Society Observatory, a platform tracking how AI affects human society.

${RISK_TAXONOMY}

For each article provided, determine:
1. Is this article about a societal risk or impact of AI? (not just AI product news)
2. If yes, classify it.

Respond with a JSON array. For irrelevant articles, include them with "relevant": false.
For relevant articles, provide:
{
  "index": <number>,
  "relevant": true,
  "summary": "<2-3 sentence summary focused on the societal impact>",
  "risk_categories": ["R01", ...],
  "severity_hint": "Critical" | "Emerging" | "Horizon",
  "affected_groups": ["<group 1>", ...],
  "confidence_score": <0.0-1.0>
}

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
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
        summary?: string;
        risk_categories?: string[];
        severity_hint?: "Critical" | "Emerging" | "Horizon";
        affected_groups?: string[];
        confidence_score?: number;
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

        results.push({
          title: article.title,
          summary: item.summary ?? "",
          source_url: article.url,
          source_name: article.source_name,
          published_date: article.published_date,
          risk_categories: item.risk_categories ?? [],
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
