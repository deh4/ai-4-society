import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { NarrativeStats, NarrativeRiskResult, NarrativeSolutionResult } from "./types.js";

const SIGNIFICANCE_SCORE_DELTA = 5;
const SIGNIFICANCE_SIGNAL_COUNT = 3;

interface ChangelogEntry {
  documentType: string;
  documentId: string;
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  reasoning: string;
  updateId: string;
}

function isSignificantRisk(changelogs: ChangelogEntry[], newSignalCount: number): boolean {
  for (const cl of changelogs) {
    for (const change of cl.changes) {
      if (
        (change.field === "score_2026" || change.field === "score_2035") &&
        typeof change.oldValue === "number" &&
        typeof change.newValue === "number"
      ) {
        if (Math.abs(change.newValue - change.oldValue) >= SIGNIFICANCE_SCORE_DELTA) return true;
      }
    }
  }
  if (newSignalCount >= SIGNIFICANCE_SIGNAL_COUNT) return true;
  return false;
}

function isSignificantSolution(changelogs: ChangelogEntry[]): boolean {
  for (const cl of changelogs) {
    for (const change of cl.changes) {
      if (change.field === "implementation_stage" && change.oldValue !== change.newValue) return true;
      if (
        (change.field === "adoption_score_2026" || change.field === "adoption_score_2035") &&
        typeof change.oldValue === "number" &&
        typeof change.newValue === "number"
      ) {
        if (Math.abs(change.newValue - change.oldValue) >= SIGNIFICANCE_SCORE_DELTA) return true;
      }
    }
  }
  return false;
}

function formatChangesForPrompt(changelogs: ChangelogEntry[]): string {
  const lines: string[] = [];
  for (const cl of changelogs) {
    for (const change of cl.changes) {
      lines.push(`- ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
    }
    if (cl.reasoning) lines.push(`  Reasoning: ${cl.reasoning}`);
  }
  return lines.join("\n");
}

async function refreshRiskNarrative(
  riskId: string,
  riskData: Record<string, unknown>,
  changelogs: ChangelogEntry[],
  recentSignals: Array<{ headline: string; source: string; date: string }>,
  geminiApiKey: string
): Promise<{ result: NarrativeRiskResult; tokenUsage: { input: number; output: number } }> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const changesFormatted = formatChangesForPrompt(changelogs);
  const signalsFormatted = recentSignals
    .map((s) => `- "${s.headline}" (${s.source}, ${s.date})`)
    .join("\n");

  const prompt = `You are updating the narrative for an AI risk tracked by the AI 4 Society Observatory.

RISK: ${riskData.risk_name} (${riskId})

CURRENT NARRATIVE:
Summary: ${riskData.summary ?? "(none)"}

Deep Dive: ${riskData.deep_dive ?? "(none)"}

Who Affected: ${JSON.stringify(riskData.who_affected ?? [])}

RECENT CHANGES (last 7 days):
${changesFormatted}

NEW SIGNAL EVIDENCE:
${signalsFormatted || "(none)"}

INSTRUCTIONS:
- Revise the summary, deep_dive, and who_affected to incorporate these changes
- Keep the existing tone, structure, and approximate length
- Only modify sentences directly affected by the new data
- Do NOT remove existing content unless it's contradicted by new evidence
- Preserve all markdown formatting
- who_affected should be an array of strings (stakeholder groups)

Return a single JSON object (no markdown fences):
{ "summary": "...", "deep_dive": "...", "who_affected": ["..."] }`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
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

  const text = result.response.text();
  const parsed = JSON.parse(text) as NarrativeRiskResult;

  if (typeof parsed.summary !== "string" || typeof parsed.deep_dive !== "string" || !Array.isArray(parsed.who_affected)) {
    throw new Error(`Invalid narrative response for risk ${riskId}`);
  }

  return { result: parsed, tokenUsage };
}

async function refreshSolutionNarrative(
  solutionId: string,
  solutionData: Record<string, unknown>,
  changelogs: ChangelogEntry[],
  geminiApiKey: string
): Promise<{ result: NarrativeSolutionResult; tokenUsage: { input: number; output: number } }> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const changesFormatted = formatChangesForPrompt(changelogs);

  const prompt = `You are updating the narrative for an AI solution tracked by the AI 4 Society Observatory.

SOLUTION: ${solutionData.solution_title} (${solutionId})
Parent Risk: ${solutionData.parent_risk_id}
Implementation Stage: ${solutionData.implementation_stage}
Adoption Score 2026: ${solutionData.adoption_score_2026}
Key Players: ${JSON.stringify(solutionData.key_players ?? [])}
Barriers: ${JSON.stringify(solutionData.barriers ?? [])}

CURRENT NARRATIVE:
Summary: ${solutionData.summary ?? "(none)"}

Deep Dive: ${solutionData.deep_dive ?? "(none)"}

RECENT CHANGES (last 7 days):
${changesFormatted}

INSTRUCTIONS:
- Revise the summary and deep_dive to incorporate these changes
- Keep the existing tone, structure, and approximate length
- Only modify sentences directly affected by the new data
- Do NOT remove existing content unless it's contradicted by new evidence
- Preserve all markdown formatting

Return a single JSON object (no markdown fences):
{ "summary": "...", "deep_dive": "..." }`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
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

  const text = result.response.text();
  const parsed = JSON.parse(text) as NarrativeSolutionResult;

  if (typeof parsed.summary !== "string" || typeof parsed.deep_dive !== "string") {
    throw new Error(`Invalid narrative response for solution ${solutionId}`);
  }

  return { result: parsed, tokenUsage };
}

export async function processNarratives(geminiApiKey: string): Promise<NarrativeStats> {
  const db = getFirestore();
  const stats: NarrativeStats = {
    risksRefreshed: 0, solutionsRefreshed: 0,
    skippedInsignificant: 0, geminiCalls: 0,
    tokensInput: 0, tokensOutput: 0,
  };

  // Read changelogs from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const changelogsSnap = await db.collection("changelogs")
    .where("createdAt", ">", sevenDaysAgo)
    .get();

  if (changelogsSnap.empty) {
    logger.info("No recent changelogs. Skipping narrative refresh.");
    return stats;
  }

  // Group by documentId
  const riskChangelogs = new Map<string, ChangelogEntry[]>();
  const solutionChangelogs = new Map<string, ChangelogEntry[]>();

  for (const doc of changelogsSnap.docs) {
    const data = doc.data() as ChangelogEntry;
    if (data.documentType === "risk") {
      const existing = riskChangelogs.get(data.documentId) ?? [];
      existing.push(data);
      riskChangelogs.set(data.documentId, existing);
    } else if (data.documentType === "solution") {
      const existing = solutionChangelogs.get(data.documentId) ?? [];
      existing.push(data);
      solutionChangelogs.set(data.documentId, existing);
    }
  }

  // Process risks
  for (const [riskId, changelogs] of riskChangelogs) {
    let newSignalCount = 0;
    for (const cl of changelogs) {
      const updateSnap = await db.collection("risk_updates").doc(cl.updateId).get();
      if (updateSnap.exists) {
        const evidence = updateSnap.data()?.newSignalEvidence;
        if (Array.isArray(evidence)) newSignalCount += evidence.length;
      }
    }

    if (!isSignificantRisk(changelogs, newSignalCount)) {
      stats.skippedInsignificant++;
      logger.info(`Skipping narrative refresh for risk ${riskId} (not significant)`);
      continue;
    }

    const riskSnap = await db.collection("risks").doc(riskId).get();
    if (!riskSnap.exists) continue;
    const riskData = riskSnap.data() as Record<string, unknown>;

    const recentSignals: Array<{ headline: string; source: string; date: string }> = [];
    const signalEvidence = riskData.signal_evidence;
    if (Array.isArray(signalEvidence)) {
      for (const e of signalEvidence) {
        const entry = e as Record<string, unknown>;
        if (entry.isNew === true) {
          recentSignals.push({
            headline: (entry.headline as string) ?? "",
            source: (entry.source as string) ?? "",
            date: (entry.date as string) ?? "",
          });
        }
      }
    }

    try {
      const { result, tokenUsage } = await refreshRiskNarrative(riskId, riskData, changelogs, recentSignals, geminiApiKey);
      stats.geminiCalls++;
      stats.tokensInput += tokenUsage.input;
      stats.tokensOutput += tokenUsage.output;

      await db.collection("risks").doc(riskId).update({
        summary: result.summary,
        deep_dive: result.deep_dive,
        who_affected: result.who_affected,
      });
      stats.risksRefreshed++;
      logger.info(`Refreshed narrative for risk ${riskId}`);
    } catch (err) {
      logger.error(`Narrative refresh failed for risk ${riskId}:`, err);
    }
  }

  // Process solutions
  for (const [solutionId, changelogs] of solutionChangelogs) {
    if (!isSignificantSolution(changelogs)) {
      stats.skippedInsignificant++;
      logger.info(`Skipping narrative refresh for solution ${solutionId} (not significant)`);
      continue;
    }

    const solutionSnap = await db.collection("solutions").doc(solutionId).get();
    if (!solutionSnap.exists) continue;
    const solutionData = solutionSnap.data() as Record<string, unknown>;

    try {
      const { result, tokenUsage } = await refreshSolutionNarrative(solutionId, solutionData, changelogs, geminiApiKey);
      stats.geminiCalls++;
      stats.tokensInput += tokenUsage.input;
      stats.tokensOutput += tokenUsage.output;

      await db.collection("solutions").doc(solutionId).update({
        summary: result.summary,
        deep_dive: result.deep_dive,
      });
      stats.solutionsRefreshed++;
      logger.info(`Refreshed narrative for solution ${solutionId}`);
    } catch (err) {
      logger.error(`Narrative refresh failed for solution ${solutionId}:`, err);
    }
  }

  return stats;
}
