import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fetchAllSources } from "./signal-scout/fetcher.js";
import { classifyArticles } from "./signal-scout/classifier.js";
import { storeSignals } from "./signal-scout/store.js";
import { trackUsage, updatePipelineHealth, writeAgentRunSummary } from "./usage-monitor.js";
import { DATA_SOURCES } from "./config/sources.js";
import { runDataLifecycle } from "./data-lifecycle.js";
import { clusterSignals } from "./topic-tracker/clusterer.js";
import { storeTopics } from "./topic-tracker/store.js";
import { triageRisks } from "./risk-evaluation/triage.js";
import { evaluateRisk } from "./risk-evaluation/evaluator.js";
import { storeRiskUpdates } from "./risk-evaluation/store.js";
import type { EvalRiskInput } from "./risk-evaluation/evaluator.js";

initializeApp();

// ─── Signal Scout Pipeline ──────────────────────────────────────────────────

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const BATCH_SIZE = 10; // matches classifier batch size

export const signalScout = onSchedule(
  {
    schedule: "every 6 hours",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Signal Scout: starting pipeline run");
    const runStartedAt = new Date();
    const db = getFirestore();

    try {
      // Step 0: Read agent config for enabled sources
      let enabledSourceIds: Set<string> | undefined;
      try {
        const configSnap = await db.collection("agents").doc("signal-scout").collection("config").doc("current").get();
        if (configSnap.exists) {
          const config = configSnap.data()!;
          const sources = config.sources as Record<string, { enabled: boolean }>;
          enabledSourceIds = new Set(
            Object.entries(sources)
              .filter(([, v]) => v.enabled)
              .map(([k]) => k)
          );
          logger.info(`Config loaded: ${enabledSourceIds.size} sources enabled`);
        }
      } catch (err) {
        logger.warn("Failed to read agent config, using all sources:", err);
      }

      // Step 1: Fetch articles from all sources
      const articles = await fetchAllSources(enabledSourceIds);
      const enabledSourcesList = enabledSourceIds ? [...enabledSourceIds] : DATA_SOURCES.map((s) => s.id);
      logger.info(`Fetched ${articles.length} unique articles`);

      if (articles.length === 0) {
        logger.info("No articles found. Ending run.");
        await trackUsage({
          articlesFetched: 0,
          geminiCalls: 0,
          signalsStored: 0,
          firestoreReads: 1,
          firestoreWrites: 3,
        });
        await updatePipelineHealth("empty", { articlesFetched: 0, signalsStored: 0 });
        await writeAgentRunSummary({
          agentId: "signal-scout",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: 0,
            signalsStored: 0,
            geminiCalls: 0,
            tokensInput: 0,
            tokensOutput: 0,
            firestoreReads: 1,
            firestoreWrites: 3,
          },
          sourcesUsed: enabledSourcesList,
        });
        return;
      }

      // Step 2: Classify with Gemini
      const { signals, tokenUsage } = await classifyArticles(articles, geminiApiKey.value());
      const geminiCalls = Math.ceil(articles.length / BATCH_SIZE);
      logger.info(`Classified ${signals.length} relevant signals`);

      if (signals.length === 0) {
        logger.info("No relevant signals found. Ending run.");
        await trackUsage({
          articlesFetched: articles.length,
          geminiCalls,
          signalsStored: 0,
          firestoreReads: 1,
          firestoreWrites: 3,
        });
        await updatePipelineHealth("empty", { articlesFetched: articles.length, signalsStored: 0 });
        await writeAgentRunSummary({
          agentId: "signal-scout",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: articles.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: tokenUsage.input,
            tokensOutput: tokenUsage.output,
            firestoreReads: 1,
            firestoreWrites: 3,
          },
          sourcesUsed: enabledSourcesList,
        });
        return;
      }

      // Step 3: Store in Firestore
      const stored = await storeSignals(signals);
      logger.info(`Pipeline complete. Stored ${stored} new signals.`);

      // Step 4: Track usage + health
      await trackUsage({
        articlesFetched: articles.length,
        geminiCalls,
        signalsStored: stored,
        firestoreReads: 1 + signals.length,
        firestoreWrites: stored + 3,
      });

      const outcome = stored > 0 ? "success" : "partial";
      await updatePipelineHealth(outcome, { articlesFetched: articles.length, signalsStored: stored });
      await writeAgentRunSummary({
        agentId: "signal-scout",
        startedAt: runStartedAt,
        outcome,
        error: null,
        metrics: {
          articlesFetched: articles.length,
          signalsStored: stored,
          geminiCalls,
          tokensInput: tokenUsage.input,
          tokensOutput: tokenUsage.output,
          firestoreReads: 1 + signals.length,
          firestoreWrites: stored + 3,
        },
        sourcesUsed: enabledSourcesList,
      });
    } catch (err) {
      logger.error("Signal Scout pipeline error:", err);
      await updatePipelineHealth("error", { articlesFetched: 0, signalsStored: 0 });
      await writeAgentRunSummary({
        agentId: "signal-scout",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0,
          signalsStored: 0,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads: 0,
          firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);

/**
 * Simple HTTP endpoint to check current usage stats.
 * GET https://<region>-ai-4-society.cloudfunctions.net/usageReport
 */
export const usageReport = onRequest(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (_req, res) => {
    const db = getFirestore();
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);

    const [dailySnap, monthlySnap, signalsSnap] = await Promise.all([
      db.collection("_usage").doc(`daily-${dateKey}`).get(),
      db.collection("_usage").doc(`monthly-${monthKey}`).get(),
      db.collection("signals").count().get(),
    ]);

    const daily = dailySnap.exists ? dailySnap.data() : null;
    const monthly = monthlySnap.exists ? monthlySnap.data() : null;
    const totalSignals = signalsSnap.data().count;

    const FREE_TIER = {
      firestoreReadsPerDay: 50_000,
      firestoreWritesPerDay: 20_000,
      functionInvocationsPerMonth: 2_000_000,
    };

    res.json({
      status: "ok",
      today: dateKey,
      month: monthKey,
      totalSignalsInCollection: totalSignals,
      daily: daily
        ? {
            runs: daily.runs,
            firestoreReads: daily.firestoreReads,
            firestoreWrites: daily.firestoreWrites,
            readsPctOfFreeTier: `${Math.round(((daily.firestoreReads as number) / FREE_TIER.firestoreReadsPerDay) * 100)}%`,
            writesPctOfFreeTier: `${Math.round(((daily.firestoreWrites as number) / FREE_TIER.firestoreWritesPerDay) * 100)}%`,
          }
        : "No runs today",
      monthly: monthly
        ? {
            totalRuns: monthly.totalRuns,
            totalGeminiCalls: monthly.totalGeminiCalls,
            totalSignalsStored: monthly.totalSignalsStored,
            totalFirestoreReads: monthly.totalFirestoreReads,
            totalFirestoreWrites: monthly.totalFirestoreWrites,
            runsPctOfFreeTier: `${Math.round(((monthly.totalRuns as number) / FREE_TIER.functionInvocationsPerMonth) * 100)}%`,
          }
        : "No runs this month",
    });
  }
);

// ─── Feature 2: Pipeline Health HTTP endpoint ───────────────────────────────

export const pipelineHealth = onRequest(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (_req, res) => {
    const db = getFirestore();
    const healthSnap = await db.collection("_pipeline_health").doc("status").get();

    if (!healthSnap.exists) {
      res.json({ status: "unknown", message: "No pipeline runs recorded yet" });
      return;
    }

    const data = healthSnap.data()!;
    const lastRunAt = data.lastRunAt?.toDate?.() ?? null;
    const hoursAgo = lastRunAt
      ? (Date.now() - lastRunAt.getTime()) / (1000 * 60 * 60)
      : Infinity;

    let health: "green" | "yellow" | "red";
    const warnings: string[] = [];

    if (hoursAgo > 12 || (data.consecutiveErrors ?? 0) >= 2) {
      health = "red";
      if (hoursAgo > 12) warnings.push(`Last run was ${Math.round(hoursAgo)}h ago`);
      if ((data.consecutiveErrors ?? 0) >= 2) warnings.push(`${data.consecutiveErrors} consecutive errors`);
    } else if (hoursAgo > 7 || (data.consecutiveEmptyRuns ?? 0) >= 3) {
      health = "yellow";
      if (hoursAgo > 7) warnings.push(`Last run was ${Math.round(hoursAgo)}h ago`);
      if ((data.consecutiveEmptyRuns ?? 0) >= 3) warnings.push(`${data.consecutiveEmptyRuns} consecutive empty runs`);
    } else {
      health = "green";
    }

    res.json({
      health,
      lastRunAt: lastRunAt?.toISOString() ?? null,
      lastRunOutcome: data.lastRunOutcome ?? null,
      consecutiveEmptyRuns: data.consecutiveEmptyRuns ?? 0,
      consecutiveErrors: data.consecutiveErrors ?? 0,
      lastNewSignalAt: data.lastNewSignalAt?.toDate?.()?.toISOString() ?? null,
      totalSignals: data.totalSignals ?? 0,
      articlesFetched: data.articlesFetched ?? 0,
      signalsStored: data.signalsStored ?? 0,
      warnings,
    });
  }
);

// ─── Feature 3: Data Lifecycle (daily at 03:00 UTC) ─────────────────────────

export const dataLifecycle = onSchedule(
  {
    schedule: "0 3 * * *",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    logger.info("Data lifecycle: starting daily run");
    const stats = await runDataLifecycle();
    logger.info("Data lifecycle complete:", stats);
  }
);

// ─── Topic Tracker Pipeline ─────────────────────────────────────────────────

export const topicTracker = onSchedule(
  {
    schedule: "0 8 * * *",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Topic Tracker: starting daily run");
    const runStartedAt = new Date();
    const db = getFirestore();

    try {
      // Step 1: Read approved signals from last 7 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);

      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .orderBy("fetched_at", "desc")
        .get();

      const signals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: d.data().title as string,
        summary: d.data().summary as string,
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
      }));

      // Build signal date map for firstSeenAt calculation
      const signalDates = new Map<string, FirebaseFirestore.Timestamp>();
      for (const d of signalsSnap.docs) {
        const fetchedAt = d.data().fetched_at;
        if (fetchedAt) {
          signalDates.set(d.id, fetchedAt);
        }
      }

      logger.info(`Read ${signals.length} approved signals from last 7 days`);

      if (signals.length < 3) {
        logger.info("Fewer than 3 signals — insufficient data for clustering. Ending run.");
        await writeAgentRunSummary({
          agentId: "topic-tracker",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls: 0,
            tokensInput: 0,
            tokensOutput: 0,
            firestoreReads: 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 2: Read previous topics (from last 24h) for velocity comparison
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const prevTopicsSnap = await db
        .collection("topics")
        .where("createdAt", ">", oneDayAgo)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      const previousTopics = prevTopicsSnap.docs.map((d) => ({
        name: d.data().name as string,
        riskCategories: (d.data().riskCategories as string[]) ?? [],
        velocity: (d.data().velocity as string) ?? "stable",
        signalCount: (d.data().signalCount as number) ?? 0,
      }));

      logger.info(`Read ${previousTopics.length} previous topics for velocity comparison`);

      // Step 3: Cluster with Gemini
      const { topics, tokenUsage } = await clusterSignals(
        signals,
        previousTopics,
        geminiApiKey.value()
      );

      if (topics.length === 0) {
        logger.info("No topics produced. Ending run.");
        await writeAgentRunSummary({
          agentId: "topic-tracker",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls: 1,
            tokensInput: tokenUsage.input,
            tokensOutput: tokenUsage.output,
            firestoreReads: 1 + (prevTopicsSnap.size > 0 ? 1 : 0),
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 4: Generate a run ID and store topics
      const runRef = db.collection("agents").doc("topic-tracker").collection("runs").doc();
      const stored = await storeTopics(topics, signalDates, runRef.id);

      logger.info(`Topic Tracker complete. Stored ${stored} topics from ${signals.length} signals.`);

      // Step 5: Track health
      const outcome = stored > 0 ? "success" : "partial";
      await writeAgentRunSummary({
        agentId: "topic-tracker",
        startedAt: runStartedAt,
        outcome,
        error: null,
        metrics: {
          articlesFetched: signals.length,
          signalsStored: stored,
          geminiCalls: 1,
          tokensInput: tokenUsage.input,
          tokensOutput: tokenUsage.output,
          firestoreReads: 1 + (prevTopicsSnap.size > 0 ? 1 : 0),
          firestoreWrites: stored + 1,
        },
        sourcesUsed: [],
      });
    } catch (err) {
      logger.error("Topic Tracker pipeline error:", err);
      await writeAgentRunSummary({
        agentId: "topic-tracker",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0,
          signalsStored: 0,
          geminiCalls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          firestoreReads: 0,
          firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);

// ─── Risk Evaluation Pipeline ───────────────────────────────────────────────

export const riskEvaluation = onSchedule(
  {
    schedule: "0 9 * * *",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Risk Evaluation: starting daily run");
    const runStartedAt = new Date();
    const db = getFirestore();
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let geminiCalls = 0;

    try {
      // Step 1: Read approved signals from last 7 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);

      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .orderBy("fetched_at", "desc")
        .get();

      const signals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: d.data().title as string,
        summary: d.data().summary as string,
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
        source_url: (d.data().source_url as string) ?? "",
      }));

      logger.info(`Read ${signals.length} approved signals from last 7 days`);

      if (signals.length < 3) {
        logger.info("Fewer than 3 signals — insufficient data for risk evaluation. Ending run.");
        await writeAgentRunSummary({
          agentId: "risk-evaluation",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls: 0,
            tokensInput: 0,
            tokensOutput: 0,
            firestoreReads: 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 2: Read latest topics (last 24h)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const topicsSnap = await db
        .collection("topics")
        .where("createdAt", ">", oneDayAgo)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      const topics = topicsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        description: (d.data().description as string) ?? "",
        riskCategories: (d.data().riskCategories as string[]) ?? [],
        velocity: (d.data().velocity as string) ?? "stable",
        signalCount: (d.data().signalCount as number) ?? 0,
      }));

      logger.info(`Read ${topics.length} topics from last 24h`);

      // Step 3: Read current risk documents
      const risksSnap = await db.collection("risks").get();
      const risks = risksSnap.docs.map((d) => ({
        id: d.id,
        risk_name: (d.data().risk_name as string) ?? d.id,
        score_2026: (d.data().score_2026 as number) ?? 50,
        score_2035: (d.data().score_2035 as number) ?? 50,
        velocity: (d.data().velocity as string) ?? "Medium",
        expert_severity: (d.data().expert_severity as number) ?? 50,
        public_perception: (d.data().public_perception as number) ?? 50,
        signalEvidenceCount: Array.isArray(d.data().signal_evidence) ? (d.data().signal_evidence as unknown[]).length : 0,
      }));

      logger.info(`Read ${risks.length} current risk documents`);

      // Step 4: Stage 1 — Triage
      const triageInput = signals.map((s) => ({
        id: s.id,
        title: s.title,
        risk_categories: s.risk_categories,
        severity_hint: s.severity_hint,
      }));

      const triageTopics = topics.map((t) => ({
        id: t.id,
        name: t.name,
        riskCategories: t.riskCategories,
        velocity: t.velocity,
        signalCount: t.signalCount,
      }));

      const triageRiskInput = risks.map((r) => ({
        id: r.id,
        name: r.risk_name,
        score_2026: r.score_2026,
        velocity: r.velocity,
      }));

      const { flaggedRisks, tokenUsage: triageTokens } = await triageRisks(
        triageInput,
        triageTopics,
        triageRiskInput,
        geminiApiKey.value()
      );

      totalTokensInput += triageTokens.input;
      totalTokensOutput += triageTokens.output;
      geminiCalls++;

      if (flaggedRisks.length === 0) {
        logger.info("No risks flagged for re-evaluation. Ending run.");
        await writeAgentRunSummary({
          agentId: "risk-evaluation",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: totalTokensInput,
            tokensOutput: totalTokensOutput,
            firestoreReads: 1 + 1 + 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      logger.info(`Stage 1: flagged ${flaggedRisks.length} risks: ${flaggedRisks.map((r) => r.riskId).join(", ")}`);

      // Step 5: Stage 2 — Per-risk evaluation
      const signalMap = new Map(signals.map((s) => [s.id, s]));
      const topicMap = new Map(topics.map((t) => [t.id, t]));
      const riskMap = new Map(risks.map((r) => [r.id, r]));

      const updates: Array<{
        risk: EvalRiskInput;
        evaluation: Awaited<ReturnType<typeof evaluateRisk>>["evaluation"];
        topicIds: string[];
        signalCount: number;
      }> = [];

      for (const flagged of flaggedRisks) {
        const risk = riskMap.get(flagged.riskId);
        if (!risk) continue;

        const relevantSignals = flagged.relevantSignalIds
          .map((id) => signalMap.get(id))
          .filter((s): s is NonNullable<typeof s> => s !== undefined);

        const relevantTopics = flagged.relevantTopicIds
          .map((id) => topicMap.get(id))
          .filter((t): t is NonNullable<typeof t> => t !== undefined);

        if (relevantSignals.length === 0) {
          logger.info(`Skipping ${flagged.riskId}: no valid signals after filtering`);
          continue;
        }

        try {
          const { evaluation, tokenUsage: evalTokens } = await evaluateRisk(
            risk,
            relevantSignals,
            relevantTopics,
            geminiApiKey.value()
          );

          totalTokensInput += evalTokens.input;
          totalTokensOutput += evalTokens.output;
          geminiCalls++;

          updates.push({
            risk,
            evaluation,
            topicIds: flagged.relevantTopicIds,
            signalCount: relevantSignals.length,
          });
        } catch (err) {
          logger.error(`Failed to evaluate ${flagged.riskId}, skipping:`, err);
        }
      }

      if (updates.length === 0) {
        logger.info("All per-risk evaluations failed or produced no results. Ending run.");
        await writeAgentRunSummary({
          agentId: "risk-evaluation",
          startedAt: runStartedAt,
          outcome: "partial",
          error: null,
          metrics: {
            articlesFetched: signals.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: totalTokensInput,
            tokensOutput: totalTokensOutput,
            firestoreReads: 1 + 1 + 1,
            firestoreWrites: 1,
          },
          sourcesUsed: [],
        });
        return;
      }

      // Step 6: Store risk updates
      const runRef = db.collection("agents").doc("risk-evaluation").collection("runs").doc();
      const stored = await storeRiskUpdates(updates, runRef.id);

      logger.info(`Risk Evaluation complete. Stored ${stored} risk updates from ${signals.length} signals.`);

      // Step 7: Track health
      await writeAgentRunSummary({
        agentId: "risk-evaluation",
        startedAt: runStartedAt,
        outcome: "success",
        error: null,
        metrics: {
          articlesFetched: signals.length,
          signalsStored: stored,
          geminiCalls,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          firestoreReads: 1 + 1 + 1,
          firestoreWrites: stored + 1,
        },
        sourcesUsed: [],
      });
    } catch (err) {
      logger.error("Risk Evaluation pipeline error:", err);
      await writeAgentRunSummary({
        agentId: "risk-evaluation",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          articlesFetched: 0,
          signalsStored: 0,
          geminiCalls,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          firestoreReads: 0,
          firestoreWrites: 0,
        },
        sourcesUsed: [],
      });
    }
  }
);
