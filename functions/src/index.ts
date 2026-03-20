import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchAllSources } from "./signal-scout/fetcher.js";
import { classifyArticles } from "./signal-scout/classifier.js";
import { storeSignals } from "./signal-scout/store.js";
import { updatePipelineHealth, writeAgentRunSummary } from "./usage-monitor.js";
// import { trackUsage } from "./usage-monitor.js"; // v1 only — used by commented-out signalScout
import { DATA_SOURCES } from "./config/sources.js";
// import { runDataLifecycle } from "./data-lifecycle.js"; // v1 only — used by commented-out dataLifecycle
import { runDataLifecycle as runDataLifecycleV2 } from "./agents/data-lifecycle/index.js";
import { analyzeSignals, UnmatchedSignal, PendingProposal } from "./discovery-agent/analyzer.js";
import { storeDiscoveryProposals } from "./discovery-agent/store.js";
import { assessRisk, assessSolution } from "./validator-agent/assessor.js";
import { storeValidationProposal, resetPendingCache } from "./validator-agent/store.js";

initializeApp();

/** Check if the calling user has one of the required roles */
async function requireRole(uid: string, requiredRoles: string[]): Promise<void> {
    const db = getFirestore();
    const userSnap = await db.collection('users').doc(uid).get();

    if (!userSnap.exists) {
        // Fallback: check legacy admins collection during migration
        const adminSnap = await db.collection('admins').doc(uid).get();
        if (adminSnap.exists) return; // Legacy admin, allow
        throw new HttpsError('permission-denied', 'No user profile found');
    }

    const userData = userSnap.data()!;
    if (userData.status !== 'active') {
        throw new HttpsError('permission-denied', 'User account is not active');
    }

    const userRoles = userData.roles as string[];
    if (!requiredRoles.some(r => userRoles.includes(r))) {
        throw new HttpsError('permission-denied', `Requires one of: ${requiredRoles.join(', ')}`);
    }
}

// ─── Signal Scout Pipeline ──────────────────────────────────────────────────

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const BATCH_SIZE = 25; // matches classifier batch size

// v1 — replaced by v2 agents in functions/src/agents/
/* export const signalScout = onSchedule(
  {
    schedule: "every 12 hours",
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
            DATA_SOURCES
              .filter((src) => sources[src.id]?.enabled !== false)
              .map((src) => src.id)
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

      // Pre-classify dedup: skip articles already stored in signals collection
      const existingSnap = await db.collection("signals").select("source_url").get();
      const existingUrls = new Set(existingSnap.docs.map((d) => d.data().source_url as string));
      const newArticles = articles.filter((a) => !existingUrls.has(a.url));
      logger.info(`Pre-classify dedup: ${articles.length} fetched, ${newArticles.length} new`);

      if (newArticles.length === 0) {
        logger.info("No new articles after dedup. Ending run.");
        const usage = await trackUsage({
          articlesFetched: articles.length,
          geminiCalls: 0,
          signalsStored: 0,
          firestoreReads: 1 + existingSnap.size,
          firestoreWrites: 3,
        });
        await updatePipelineHealth("empty", { articlesFetched: 0, signalsStored: 0 });
        await writeAgentRunSummary({
          agentId: "signal-scout",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          modelId: "gemini-2.5-flash",
          memoryMiB: 512,
          metrics: {
            articlesFetched: 0,
            signalsStored: 0,
            geminiCalls: 0,
            tokensInput: 0,
            tokensOutput: 0,
            firestoreReads: 1 + existingSnap.size,
            firestoreWrites: 3,
          },
          sourcesUsed: enabledSourcesList,
        }, usage);
        return;
      }

      // Step 2: Classify with Gemini (only new articles)
      const { signals, tokenUsage } = await classifyArticles(newArticles, geminiApiKey.value());
      const geminiCalls = Math.ceil(newArticles.length / BATCH_SIZE);
      logger.info(`Classified ${signals.length} relevant signals`);

      if (signals.length === 0) {
        logger.info("No relevant signals found. Ending run.");
        const usage = await trackUsage({
          articlesFetched: articles.length,
          geminiCalls,
          signalsStored: 0,
          firestoreReads: 1 + existingSnap.size,
          firestoreWrites: 3,
        });
        await updatePipelineHealth("empty", { articlesFetched: newArticles.length, signalsStored: 0 });
        await writeAgentRunSummary({
          agentId: "signal-scout",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          modelId: "gemini-2.5-flash",
          memoryMiB: 512,
          metrics: {
            articlesFetched: articles.length,
            signalsStored: 0,
            geminiCalls,
            tokensInput: tokenUsage.input,
            tokensOutput: tokenUsage.output,
            firestoreReads: 1 + existingSnap.size,
            firestoreWrites: 3,
          },
          sourcesUsed: enabledSourcesList,
        }, usage);
        return;
      }

      // Step 3: Store in Firestore
      const stored = await storeSignals(signals);
      logger.info(`Pipeline complete. Stored ${stored} new signals.`);

      // Step 4: Track usage + health
      const usage = await trackUsage({
        articlesFetched: articles.length,
        geminiCalls,
        signalsStored: stored,
        firestoreReads: 1 + existingSnap.size + signals.length,
        firestoreWrites: stored + 3,
      });

      const outcome = stored > 0 ? "success" : "partial";
      await updatePipelineHealth(outcome, { articlesFetched: newArticles.length, signalsStored: stored });
      await writeAgentRunSummary({
        agentId: "signal-scout",
        startedAt: runStartedAt,
        outcome,
        error: null,
        modelId: "gemini-2.5-flash",
        memoryMiB: 512,
        metrics: {
          articlesFetched: articles.length,
          signalsStored: stored,
          geminiCalls,
          tokensInput: tokenUsage.input,
          tokensOutput: tokenUsage.output,
          firestoreReads: 1 + existingSnap.size + signals.length,
          firestoreWrites: stored + 3,
        },
        sourcesUsed: enabledSourcesList,
      }, usage);
    } catch (err) {
      logger.error("Signal Scout pipeline error:", err);
      await updatePipelineHealth("error", { articlesFetched: 0, signalsStored: 0 });
      await writeAgentRunSummary({
        agentId: "signal-scout",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        modelId: "gemini-2.5-flash",
        memoryMiB: 512,
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
      }, null);
    }
  }
); */

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

    if (hoursAgo > 24 || (data.consecutiveErrors ?? 0) >= 2) {
      health = "red";
      if (hoursAgo > 24) warnings.push(`Last run was ${Math.round(hoursAgo)}h ago`);
      if ((data.consecutiveErrors ?? 0) >= 2) warnings.push(`${data.consecutiveErrors} consecutive errors`);
    } else if (hoursAgo > 14 || (data.consecutiveEmptyRuns ?? 0) >= 3) {
      health = "yellow";
      if (hoursAgo > 14) warnings.push(`Last run was ${Math.round(hoursAgo)}h ago`);
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

// v1 — replaced by v2 agents in functions/src/agents/
/* export const dataLifecycle = onSchedule(
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
); */

// ─── Discovery Agent Pipeline ────────────────────────────────────────────────

// v1 — replaced by v2 agents in functions/src/agents/
/* export const discoveryAgent = onSchedule(
  {
    schedule: "0 10 * * 0",  // Weekly, Sunday 10:00 UTC
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Discovery Agent: starting weekly run");
    const runStartedAt = new Date();
    const db = getFirestore();

    try {
      // Step 1: Read classified signals from last 30 days (including pending)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["pending", "approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .orderBy("fetched_at", "desc")
        .get();

      const signals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        signal_type: (d.data().signal_type as string) ?? "risk",
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        solution_ids: (d.data().solution_ids as string[]) ?? [],
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
      }));

      logger.info(`Discovery: ${signals.length} classified signals in last 30 days`);

      // Also fetch unmatched signals (any status) from last 30 days
      const unmatchedSnap = await db
        .collection("signals")
        .where("signal_type", "==", "unmatched")
        .where("fetched_at", ">", cutoff)
        .orderBy("fetched_at", "desc")
        .get();

      const unmatchedSignals: UnmatchedSignal[] = unmatchedSnap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        proposed_topic: (d.data().proposed_topic as string) ?? "",
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
      }));

      logger.info(`Discovery: ${unmatchedSignals.length} unmatched signals in last 30 days`);

      if (signals.length < 5 && unmatchedSignals.length < 3) {
        logger.info(`Discovery: insufficient signals (${signals.length} approved, ${unmatchedSignals.length} unmatched), skipping Gemini call`);
        await writeAgentRunSummary({
          agentId: "discovery-agent",
          startedAt: runStartedAt,
          outcome: "empty",
          error: null,
          modelId: "gemini-2.5-pro",
          memoryMiB: 512,
          metrics: { articlesFetched: signals.length + unmatchedSignals.length, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 2, firestoreWrites: 0 },
          sourcesUsed: [],
        });
        return;
      }

      // Step 2: Read current registry (name + description only) + pending proposals
      const [risksSnap, solutionsSnap, pendingProposalsSnap] = await Promise.all([
        db.collection("risks").get(),
        db.collection("solutions").get(),
        db.collection("discovery_proposals").where("status", "==", "pending").get(),
      ]);

      const risks = risksSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().risk_name as string) ?? d.id,
        description: (d.data().summary as string) ?? "",
      }));

      const solutions = solutionsSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().solution_title as string) ?? d.id,
        description: (d.data().summary as string) ?? "",
      }));

      const pendingProposals: PendingProposal[] = pendingProposalsSnap.docs.map((d) => ({
        proposed_name: (d.data().proposed_name as string) ?? "",
        type: (d.data().type as "new_risk" | "new_solution") ?? "new_risk",
        description: (d.data().description as string) ?? "",
      }));

      // Step 3: Analyze with Gemini 2.5 Pro
      const { proposals, tokenUsage } = await analyzeSignals(
        signals, unmatchedSignals, risks, solutions, geminiApiKey.value(), pendingProposals
      );

      // Step 4: Store proposals
      const stored = await storeDiscoveryProposals(proposals);

      await writeAgentRunSummary({
        agentId: "discovery-agent",
        startedAt: runStartedAt,
        outcome: stored > 0 ? "success" : "empty",
        error: null,
        modelId: "gemini-2.5-pro",
        memoryMiB: 512,
        metrics: {
          articlesFetched: signals.length,
          signalsStored: stored,
          geminiCalls: 1,
          tokensInput: tokenUsage.input,
          tokensOutput: tokenUsage.output,
          firestoreReads: 3,
          firestoreWrites: stored,
        },
        sourcesUsed: [],
      });

      logger.info(`Discovery Agent complete: ${stored} proposals stored`);
    } catch (err) {
      logger.error("Discovery Agent failed:", err);
      await writeAgentRunSummary({
        agentId: "discovery-agent",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        modelId: "gemini-2.5-pro",
        memoryMiB: 512,
        metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 0, firestoreWrites: 0 },
        sourcesUsed: [],
      });
    }
  }
); */

// ─── Validator Agent Pipeline ─────────────────────────────────────────────────

// v1 — replaced by v2 agents in functions/src/agents/
/* export const validatorAgent = onSchedule(
  {
    schedule: "0 9 * * 1",  // Weekly, Monday 09:00 UTC
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info("Validator Agent: starting weekly run");
    const runStartedAt = new Date();
    const db = getFirestore();
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let geminiCalls = 0;
    let proposalsStored = 0;

    resetPendingCache();

    try {
      // Step 1: Read all risks and solutions
      const [risksSnap, solutionsSnap] = await Promise.all([
        db.collection("risks").get(),
        db.collection("solutions").get(),
      ]);

      // Step 2: Read classified signals from last 30 days (including pending)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const signalsSnap = await db
        .collection("signals")
        .where("status", "in", ["pending", "approved", "edited"])
        .where("fetched_at", ">", cutoff)
        .get();

      const allSignals = signalsSnap.docs.map((d) => ({
        id: d.id,
        title: (d.data().title as string) ?? "",
        summary: (d.data().summary as string) ?? "",
        severity_hint: (d.data().severity_hint as string) ?? "Emerging",
        source_name: (d.data().source_name as string) ?? "",
        published_date: (d.data().published_date as string) ?? "",
        risk_categories: (d.data().risk_categories as string[]) ?? [],
        solution_ids: (d.data().solution_ids as string[]) ?? [],
      }));

      logger.info(`Validator: ${risksSnap.size} risks, ${solutionsSnap.size} solutions, ${allSignals.length} signals`);

      // Step 3: Build risk map for parent-risk lookups
      const riskMap = new Map(risksSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));

      // Step 4: Assess each risk
      for (const riskDoc of risksSnap.docs) {
        const riskId = riskDoc.id;
        const relevantSignals = allSignals.filter((s) => s.risk_categories.includes(riskId));

        const { result, tokenUsage } = await assessRisk(
          riskId,
          riskDoc.data() as Record<string, unknown>,
          relevantSignals,
          geminiApiKey.value()
        );

        totalTokensInput += tokenUsage.input;
        totalTokensOutput += tokenUsage.output;
        geminiCalls++;

        if (result) {
          const docName = (riskDoc.data().risk_name as string) ?? riskId;
          await storeValidationProposal("risk", riskId, docName, result, relevantSignals.map((s) => s.id));
          proposalsStored++;
        }
      }

      // Step 5: Assess each solution
      for (const solutionDoc of solutionsSnap.docs) {
        const solutionId = solutionDoc.id;
        const parentRiskId = solutionDoc.data().parent_risk_id as string | undefined;
        const parentRisk = parentRiskId ? (riskMap.get(parentRiskId) ?? null) : null;
        const relevantSignals = allSignals.filter((s) => s.solution_ids.includes(solutionId));

        const { result, tokenUsage } = await assessSolution(
          solutionId,
          solutionDoc.data() as Record<string, unknown>,
          parentRisk,
          relevantSignals,
          geminiApiKey.value()
        );

        totalTokensInput += tokenUsage.input;
        totalTokensOutput += tokenUsage.output;
        geminiCalls++;

        if (result) {
          const docName = (solutionDoc.data().solution_title as string) ?? solutionId;
          await storeValidationProposal("solution", solutionId, docName, result, relevantSignals.map((s) => s.id));
          proposalsStored++;
        }
      }

      await writeAgentRunSummary({
        agentId: "validator-agent",
        startedAt: runStartedAt,
        outcome: "success",
        error: null,
        modelId: "gemini-2.5-pro",
        memoryMiB: 512,
        metrics: {
          articlesFetched: allSignals.length,
          signalsStored: proposalsStored,
          geminiCalls,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          firestoreReads: 3,
          firestoreWrites: proposalsStored,
        },
        sourcesUsed: [],
      });

      logger.info(`Validator Agent complete: ${proposalsStored} proposals from ${geminiCalls} Gemini calls`);
    } catch (err) {
      logger.error("Validator Agent failed:", err);
      await writeAgentRunSummary({
        agentId: "validator-agent",
        startedAt: runStartedAt,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
        modelId: "gemini-2.5-pro",
        memoryMiB: 512,
        metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls, tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, firestoreReads: 0, firestoreWrites: 0 },
        sourcesUsed: [],
      });
    }
  }
); */

// ─── Callable: Apply Validation Proposal ─────────────────────────────────────

export const applyValidationProposal = onCall(
  { memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    // Auth check
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    const uid = request.auth.uid;
    await requireRole(uid, ['scoring-reviewer', 'lead']);

    const proposalId = request.data.proposalId as string | undefined;
    if (!proposalId) throw new HttpsError("invalid-argument", "proposalId required");

    const db = getFirestore();
    const proposalRef = db.collection("validation_proposals").doc(proposalId);

    return db.runTransaction(async (tx) => {
      const proposalSnap = await tx.get(proposalRef);
      if (!proposalSnap.exists) throw new HttpsError("not-found", "Proposal not found");

      const proposal = proposalSnap.data()!;
      if (proposal.status !== "pending") {
        throw new HttpsError("failed-precondition", `Proposal is already ${proposal.status as string}`);
      }

      const docType = proposal.document_type as "risk" | "solution";
      const docId = proposal.document_id as string;
      const proposedChanges = proposal.proposed_changes as Record<string, { proposed_value: unknown }>;

      // Build update object from proposed changes
      const updates: Record<string, unknown> = {};
      const changeLog: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];

      const docRef = db.collection(docType === "risk" ? "risks" : "solutions").doc(docId);
      const docSnap = await tx.get(docRef);
      if (!docSnap.exists) throw new HttpsError("not-found", `${docType} ${docId} not found`);

      const currentDoc = docSnap.data()!;

      for (const [field, change] of Object.entries(proposedChanges)) {
        updates[field] = change.proposed_value;
        changeLog.push({
          field,
          old_value: currentDoc[field] ?? null,
          new_value: change.proposed_value,
        });
      }

      const currentVersion = (currentDoc.version as number) ?? 0;
      updates.version = currentVersion + 1;
      updates.lastUpdated = FieldValue.serverTimestamp();
      updates.lastUpdatedBy = uid;

      // Write updated document
      tx.update(docRef, updates);

      // Write changelog entry
      const changelogRef = db.collection("changelogs").doc();
      tx.set(changelogRef, {
        document_type: docType,
        document_id: docId,
        document_name: proposal.document_name,
        version: currentVersion + 1,
        changes: changeLog,
        proposal_id: proposalId,
        reviewed_by: uid,
        reviewed_at: FieldValue.serverTimestamp(),
        overall_reasoning: proposal.overall_reasoning,
        confidence: proposal.confidence,
        created_at: FieldValue.serverTimestamp(),
        created_by: "validator-agent",
      });

      // Mark proposal approved
      tx.update(proposalRef, {
        status: "approved",
        reviewed_at: FieldValue.serverTimestamp(),
        reviewed_by: uid,
      });

      // Increment reviewer's totalReviews counter
      const reviewerRef = db.collection('users').doc(uid);
      const reviewerSnap = await tx.get(reviewerRef);
      if (reviewerSnap.exists) {
          tx.update(reviewerRef, {
              totalReviews: FieldValue.increment(1),
          });
      }

      return { success: true, changesApplied: changeLog.length };
    });
  }
);

// ─── Callable: Trigger Agent Run ──────────────────────────────────────────────

export const triggerAgentRun = onCall(
  { memory: "512MiB", timeoutSeconds: 540, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
    await requireRole(request.auth.uid, ['lead']);

    const agentId = request.data.agentId as string | undefined;
    if (!agentId) throw new HttpsError("invalid-argument", "agentId required");

    logger.warn(`triggerAgentRun is deprecated for ${agentId}. Use the v2 trigger* callables directly.`);

    const validAgents = ["signal-scout", "discovery-agent", "validator-agent"];
    if (!validAgents.includes(agentId)) {
      throw new HttpsError("invalid-argument", `Unknown agent: ${agentId}. Valid agents: ${validAgents.join(", ")}`);
    }

    logger.info(`Manual trigger: ${agentId} by ${request.auth.uid}`);
    const db = getFirestore();

    // Log the manual trigger
    await db.collection("agents").doc(agentId).collection("runs").add({
      trigger: "manual",
      triggered_by: request.auth.uid,
      started_at: FieldValue.serverTimestamp(),
    });

    try {
      if (agentId === "signal-scout") {
        // Inline the signal scout pipeline logic
        const runStartedAt = new Date();

        let enabledSourceIds: Set<string> | undefined;
        try {
          const configSnap = await db.collection("agents").doc("signal-scout").collection("config").doc("current").get();
          if (configSnap.exists) {
            const config = configSnap.data()!;
            const sources = config.sources as Record<string, { enabled: boolean }>;
            enabledSourceIds = new Set(
              DATA_SOURCES
                .filter((src) => sources[src.id]?.enabled !== false)
                .map((src) => src.id)
            );
          }
        } catch (err) {
          logger.warn("Failed to read agent config:", err);
        }

        const { articles, sourceHealth } = await fetchAllSources(enabledSourceIds);
        const enabledSourcesList = enabledSourceIds ? [...enabledSourceIds] : DATA_SOURCES.map((s) => s.id);

        if (articles.length === 0) {
          await updatePipelineHealth("empty", { articlesFetched: 0, signalsStored: 0 });
          await writeAgentRunSummary({ agentId: "signal-scout", startedAt: runStartedAt, outcome: "empty", error: null, modelId: "gemini-2.5-flash", memoryMiB: 512, metrics: { articlesFetched: 0, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 1, firestoreWrites: 3 }, sourcesUsed: enabledSourcesList, sourceHealth });
          return { success: true, message: "Signal Scout completed (no articles found)" };
        }

        // Pre-classify dedup: skip articles already stored in signals collection
        const existingSnap = await db.collection("signals").select("source_url").get();
        const existingUrls = new Set(existingSnap.docs.map((d) => d.data().source_url as string));
        const newArticles = articles.filter((a) => !existingUrls.has(a.url));
        logger.info(`Manual trigger dedup: ${articles.length} fetched, ${newArticles.length} new`);

        if (newArticles.length === 0) {
          await updatePipelineHealth("empty", { articlesFetched: 0, signalsStored: 0 });
          await writeAgentRunSummary({ agentId: "signal-scout", startedAt: runStartedAt, outcome: "empty", error: null, modelId: "gemini-2.5-flash", memoryMiB: 512, metrics: { articlesFetched: articles.length, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 1 + existingSnap.size, firestoreWrites: 3 }, sourcesUsed: enabledSourcesList, sourceHealth });
          return { success: true, message: `Signal Scout completed: ${articles.length} articles fetched, 0 new after dedup` };
        }

        const { signals, tokenUsage } = await classifyArticles(newArticles, geminiApiKey.value());
        const geminiCalls = Math.ceil(newArticles.length / BATCH_SIZE);

        if (signals.length === 0) {
          await updatePipelineHealth("empty", { articlesFetched: newArticles.length, signalsStored: 0 });
          await writeAgentRunSummary({ agentId: "signal-scout", startedAt: runStartedAt, outcome: "empty", error: null, modelId: "gemini-2.5-flash", memoryMiB: 512, metrics: { articlesFetched: articles.length, signalsStored: 0, geminiCalls, tokensInput: tokenUsage.input, tokensOutput: tokenUsage.output, firestoreReads: 1 + existingSnap.size, firestoreWrites: 3 }, sourcesUsed: enabledSourcesList, sourceHealth });
          return { success: true, message: `Signal Scout completed: ${newArticles.length} new articles, 0 relevant signals` };
        }

        const stored = await storeSignals(signals);
        const outcome = stored > 0 ? "success" : "partial";
        await updatePipelineHealth(outcome, { articlesFetched: newArticles.length, signalsStored: stored });
        await writeAgentRunSummary({ agentId: "signal-scout", startedAt: runStartedAt, outcome, error: null, modelId: "gemini-2.5-flash", memoryMiB: 512, metrics: { articlesFetched: articles.length, signalsStored: stored, geminiCalls, tokensInput: tokenUsage.input, tokensOutput: tokenUsage.output, firestoreReads: 1 + existingSnap.size + signals.length, firestoreWrites: stored + 3 }, sourcesUsed: enabledSourcesList, sourceHealth });
        return { success: true, message: `Signal Scout completed: ${newArticles.length} new articles, ${stored} signals stored` };

      } else if (agentId === "discovery-agent") {
        const runStartedAt = new Date();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const signalsSnap = await db.collection("signals").where("status", "in", ["pending", "approved", "edited"]).where("fetched_at", ">", cutoff).orderBy("fetched_at", "desc").get();
        const signals = signalsSnap.docs.map((d) => ({
          id: d.id, title: (d.data().title as string) ?? "", summary: (d.data().summary as string) ?? "",
          signal_type: (d.data().signal_type as string) ?? "risk", risk_categories: (d.data().risk_categories as string[]) ?? [],
          solution_ids: (d.data().solution_ids as string[]) ?? [], severity_hint: (d.data().severity_hint as string) ?? "Emerging",
          source_name: (d.data().source_name as string) ?? "", published_date: (d.data().published_date as string) ?? "",
        }));

        // Also fetch unmatched signals (any status) from last 30 days
        const unmatchedSnap = await db.collection("signals").where("signal_type", "==", "unmatched").where("fetched_at", ">", cutoff).orderBy("fetched_at", "desc").get();
        const unmatchedSignals: UnmatchedSignal[] = unmatchedSnap.docs.map((d) => ({
          id: d.id, title: (d.data().title as string) ?? "", summary: (d.data().summary as string) ?? "",
          proposed_topic: (d.data().proposed_topic as string) ?? "", severity_hint: (d.data().severity_hint as string) ?? "Emerging",
          source_name: (d.data().source_name as string) ?? "", published_date: (d.data().published_date as string) ?? "",
        }));

        if (signals.length < 5 && unmatchedSignals.length < 3) {
          await writeAgentRunSummary({ agentId: "discovery-agent", startedAt: runStartedAt, outcome: "empty", error: null, modelId: "gemini-2.5-pro", memoryMiB: 512, metrics: { articlesFetched: signals.length + unmatchedSignals.length, signalsStored: 0, geminiCalls: 0, tokensInput: 0, tokensOutput: 0, firestoreReads: 2, firestoreWrites: 0 }, sourcesUsed: [] });
          return { success: true, message: `Discovery Agent: insufficient signals (${signals.length} approved, ${unmatchedSignals.length} unmatched)` };
        }

        const [risksSnap, solutionsSnap, pendingProposalsSnap] = await Promise.all([db.collection("risks").get(), db.collection("solutions").get(), db.collection("discovery_proposals").where("status", "==", "pending").get()]);
        const risks = risksSnap.docs.map((d) => ({ id: d.id, name: (d.data().risk_name as string) ?? d.id, description: (d.data().summary as string) ?? "" }));
        const solutions = solutionsSnap.docs.map((d) => ({ id: d.id, name: (d.data().solution_title as string) ?? d.id, description: (d.data().summary as string) ?? "" }));
        const pendingProposals: PendingProposal[] = pendingProposalsSnap.docs.map((d) => ({ proposed_name: (d.data().proposed_name as string) ?? "", type: (d.data().type as "new_risk" | "new_solution") ?? "new_risk", description: (d.data().description as string) ?? "" }));

        const { proposals, tokenUsage } = await analyzeSignals(signals, unmatchedSignals, risks, solutions, geminiApiKey.value(), pendingProposals);
        const stored = await storeDiscoveryProposals(proposals);

        await writeAgentRunSummary({ agentId: "discovery-agent", startedAt: runStartedAt, outcome: stored > 0 ? "success" : "empty", error: null, modelId: "gemini-2.5-pro", memoryMiB: 512, metrics: { articlesFetched: signals.length, signalsStored: stored, geminiCalls: 1, tokensInput: tokenUsage.input, tokensOutput: tokenUsage.output, firestoreReads: 3, firestoreWrites: stored }, sourcesUsed: [] });
        return { success: true, message: `Discovery Agent completed: ${stored} proposals from ${signals.length} signals` };

      } else {
        // validator-agent
        const runStartedAt = new Date();
        let totalTokensInput = 0, totalTokensOutput = 0, geminiCalls = 0, proposalsStored = 0;
        resetPendingCache();

        const [risksSnap, solutionsSnap] = await Promise.all([db.collection("risks").get(), db.collection("solutions").get()]);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const signalsSnap = await db.collection("signals").where("status", "in", ["pending", "approved", "edited"]).where("fetched_at", ">", cutoff).get();
        const allSignals = signalsSnap.docs.map((d) => ({
          id: d.id, title: (d.data().title as string) ?? "", summary: (d.data().summary as string) ?? "",
          severity_hint: (d.data().severity_hint as string) ?? "Emerging", source_name: (d.data().source_name as string) ?? "",
          published_date: (d.data().published_date as string) ?? "", risk_categories: (d.data().risk_categories as string[]) ?? [],
          solution_ids: (d.data().solution_ids as string[]) ?? [],
        }));

        const riskMap = new Map(risksSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));

        for (const riskDoc of risksSnap.docs) {
          const riskId = riskDoc.id;
          const relevantSignals = allSignals.filter((s) => s.risk_categories.includes(riskId));
          const { result, tokenUsage } = await assessRisk(riskId, riskDoc.data() as Record<string, unknown>, relevantSignals, geminiApiKey.value());
          totalTokensInput += tokenUsage.input; totalTokensOutput += tokenUsage.output; geminiCalls++;
          if (result) {
            await storeValidationProposal("risk", riskId, (riskDoc.data().risk_name as string) ?? riskId, result, relevantSignals.map((s) => s.id));
            proposalsStored++;
          }
        }

        for (const solutionDoc of solutionsSnap.docs) {
          const solutionId = solutionDoc.id;
          const parentRiskId = solutionDoc.data().parent_risk_id as string | undefined;
          const parentRisk = parentRiskId ? (riskMap.get(parentRiskId) ?? null) : null;
          const relevantSignals = allSignals.filter((s) => s.solution_ids.includes(solutionId));
          const { result, tokenUsage } = await assessSolution(solutionId, solutionDoc.data() as Record<string, unknown>, parentRisk, relevantSignals, geminiApiKey.value());
          totalTokensInput += tokenUsage.input; totalTokensOutput += tokenUsage.output; geminiCalls++;
          if (result) {
            await storeValidationProposal("solution", solutionId, (solutionDoc.data().solution_title as string) ?? solutionId, result, relevantSignals.map((s) => s.id));
            proposalsStored++;
          }
        }

        await writeAgentRunSummary({ agentId: "validator-agent", startedAt: runStartedAt, outcome: "success", error: null, modelId: "gemini-2.5-pro", memoryMiB: 512, metrics: { articlesFetched: allSignals.length, signalsStored: proposalsStored, geminiCalls, tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, firestoreReads: 3, firestoreWrites: proposalsStored }, sourcesUsed: [] });
        return { success: true, message: `Validator Agent completed: ${proposalsStored} proposals from ${geminiCalls} assessments` };
      }
    } catch (err) {
      logger.error(`Manual trigger ${agentId} failed:`, err);
      throw new HttpsError("internal", err instanceof Error ? err.message : "Agent run failed");
    }
  }
);

// ─── Data Lifecycle v2 (daily at 03:00 UTC) ─────────────────────────────────

export const dataLifecycleV2 = onSchedule(
  {
    schedule: "0 3 * * *",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    logger.info("Data lifecycle v2: starting daily run");
    const stats = await runDataLifecycleV2();
    logger.info("Data lifecycle v2 complete:", stats);
  }
);

// --- v2 agents ---
export { buildGraph } from "./agents/graph-builder/index.js";
export { scheduledFeedCurator, triggerFeedCurator } from "./agents/feed-curator/index.js";
export { onVoteWritten } from "./triggers/vote-aggregation.js";
export { migrateV1toV2 } from "./migration/v1-to-v2.js";
export { scheduledSignalScout, triggerSignalScout } from "./agents/signal-scout/index.js";
export { scheduledDiscovery, triggerDiscovery } from "./agents/discovery/index.js";
export { scheduledValidator, triggerValidator } from "./agents/validator/index.js";
export { approveGraphProposal, rejectGraphProposal } from "./agents/approval/index.js";
