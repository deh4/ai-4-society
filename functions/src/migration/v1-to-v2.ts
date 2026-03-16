import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

interface MigrationResult {
  nodes: number;
  edges: number;
  stakeholders: number;
  signalsMigrated: number;
  usersMigrated: number;
}

export const migrateV1toV2 = onCall(
  { memory: "1GiB", timeoutSeconds: 540 },
  async (): Promise<MigrationResult> => {
    const result: MigrationResult = {
      nodes: 0,
      edges: 0,
      stakeholders: 0,
      signalsMigrated: 0,
      usersMigrated: 0,
    };

    // --- 1. Migrate risks → nodes (preserve R01-R10 IDs) ---
    const risksSnap = await db.collection("risks").get();
    const stakeholderSet = new Set<string>();

    for (const d of risksSnap.docs) {
      const data = d.data();
      await db.doc(`nodes/${d.id}`).set({
        id: d.id,
        type: "risk",
        name: data.risk_name ?? data.name ?? d.id,
        category: data.category ?? "",
        summary: data.summary ?? "",
        deep_dive: data.deep_dive ?? "",
        score_2026: data.score_2026 ?? 50,
        score_2035: data.score_2035 ?? 50,
        velocity: data.velocity ?? "Medium",
        expert_severity: data.expert_severity ?? 50,
        public_perception: data.public_perception ?? 50,
        timeline_narrative: data.timeline_narrative ?? {
          near_term: "",
          mid_term: "",
          long_term: "",
        },
        mitigation_strategies: data.mitigation_strategies ?? [],
        version: data.version ?? 1,
        lastUpdated: data.lastUpdated ?? FieldValue.serverTimestamp(),
        lastUpdatedBy: data.lastUpdatedBy ?? "migration",
        createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      });
      result.nodes++;

      // Collect stakeholders from who_affected
      if (Array.isArray(data.who_affected)) {
        data.who_affected.forEach((s: string) => stakeholderSet.add(s));
      }

      // Create edges from connected_to
      if (Array.isArray(data.connected_to)) {
        for (const target of data.connected_to) {
          const edgeId = `${d.id}-${target}-migration`;
          const relationship = (target as string).startsWith("S")
            ? "addressed_by"
            : "correlates_with";
          const targetType = (target as string).startsWith("S")
            ? "solution"
            : "risk";
          await db.doc(`edges/${edgeId}`).set({
            id: edgeId,
            from_node: d.id,
            from_type: "risk",
            to_node: target,
            to_type: targetType,
            relationship,
            created_by: "migration",
            createdAt: FieldValue.serverTimestamp(),
          });
          result.edges++;
        }
      }
    }

    // --- 2. Migrate solutions → nodes (preserve S01-S10 IDs) ---
    const solutionsSnap = await db.collection("solutions").get();

    for (const d of solutionsSnap.docs) {
      const data = d.data();
      await db.doc(`nodes/${d.id}`).set({
        id: d.id,
        type: "solution",
        name: data.solution_title ?? data.name ?? d.id,
        solution_type: data.solution_type ?? "",
        summary: data.summary ?? "",
        deep_dive: data.deep_dive ?? "",
        implementation_stage: data.implementation_stage ?? "Research",
        adoption_score_2026: data.adoption_score_2026 ?? 0,
        adoption_score_2035: data.adoption_score_2035 ?? 0,
        key_players: data.key_players ?? [],
        barriers: data.barriers ?? [],
        timeline_narrative: data.timeline_narrative ?? {
          near_term: "",
          mid_term: "",
          long_term: "",
        },
        version: data.version ?? 1,
        lastUpdated: data.lastUpdated ?? FieldValue.serverTimestamp(),
        lastUpdatedBy: data.lastUpdatedBy ?? "migration",
        createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      });
      result.nodes++;

      // Create edge from parent risk
      if (data.parent_risk_id) {
        const edgeId = `${data.parent_risk_id}-${d.id}-addressed_by`;
        await db.doc(`edges/${edgeId}`).set({
          id: edgeId,
          from_node: data.parent_risk_id,
          from_type: "risk",
          to_node: d.id,
          to_type: "solution",
          relationship: "addressed_by",
          created_by: "migration",
          createdAt: FieldValue.serverTimestamp(),
        });
        result.edges++;
      }
    }

    // --- 3. Migrate milestones → nodes ---
    const milestonesSnap = await db.collection("milestones").get();

    for (const d of milestonesSnap.docs) {
      const data = d.data();
      await db.doc(`nodes/${d.id}`).set({
        id: d.id,
        type: "milestone",
        name: data.title ?? "",
        description: data.description ?? "",
        date: data.year ? String(data.year) : "",
        significance: "deployment", // default, can be manually enriched later
        createdAt: FieldValue.serverTimestamp(),
      });
      result.nodes++;
    }

    // --- 4. Create stakeholder nodes ---
    let stakeholderIdx = 0;
    for (const name of stakeholderSet) {
      const sId = `SH${String(stakeholderIdx + 1).padStart(2, "0")}`;
      await db.doc(`nodes/${sId}`).set({
        id: sId,
        type: "stakeholder",
        name,
        description: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      result.stakeholders++;
      stakeholderIdx++;

      // Create impacts edges from all risks that reference this stakeholder
      for (const riskDoc of risksSnap.docs) {
        const riskData = riskDoc.data();
        if (
          Array.isArray(riskData.who_affected) &&
          riskData.who_affected.includes(name)
        ) {
          const edgeId = `${riskDoc.id}-${sId}-impacts`;
          await db.doc(`edges/${edgeId}`).set({
            id: edgeId,
            from_node: riskDoc.id,
            from_type: "risk",
            to_node: sId,
            to_type: "stakeholder",
            relationship: "impacts",
            created_by: "migration",
            createdAt: FieldValue.serverTimestamp(),
          });
          result.edges++;
        }
      }
    }

    // --- 5. Migrate signals (add related_nodes, related_node_ids, scores) ---
    const signalsSnap = await db.collection("signals").get();

    // Source credibility lookup (from v1 config)
    const credibilityMap: Record<string, number> = {
      "arXiv CS.AI": 0.85,
      "MIT Technology Review": 0.8,
      "Ars Technica": 0.75,
      "The Verge": 0.65,
      "TechCrunch": 0.6,
      "Wired": 0.75,
      "TLDR AI": 0.65,
      "Import AI": 0.7,
      "Last Week in AI": 0.65,
      "GDELT": 0.5,
    };

    for (const d of signalsSnap.docs) {
      const data = d.data();
      const relatedNodes: Array<{
        node_id: string;
        node_type: string;
        relevance: number;
      }> = [];
      const relatedNodeIds: string[] = [];

      // Convert risk_categories to related_nodes
      if (Array.isArray(data.risk_categories)) {
        for (const cat of data.risk_categories) {
          relatedNodes.push({
            node_id: cat,
            node_type: "risk",
            relevance: data.confidence_score ?? 0.8,
          });
          relatedNodeIds.push(cat);
        }
      }

      // Convert solution_ids to related_nodes
      if (Array.isArray(data.solution_ids)) {
        for (const sol of data.solution_ids) {
          relatedNodes.push({
            node_id: sol,
            node_type: "solution",
            relevance: data.confidence_score ?? 0.8,
          });
          relatedNodeIds.push(sol);
        }
      }

      const credibility =
        credibilityMap[data.source_name] ?? 0.5;
      const confidence = data.confidence_score ?? 0.5;
      // severity_hint informs impact: Critical=1.0, Emerging=0.7, Horizon=0.4
      const severityMultiplier =
        data.severity_hint === "Critical" ? 1.0
        : data.severity_hint === "Emerging" ? 0.7
        : data.severity_hint === "Horizon" ? 0.4
        : 0.7; // default
      const impactScore = credibility * confidence * severityMultiplier;

      await d.ref.update({
        related_nodes: relatedNodes,
        related_node_ids: relatedNodeIds,
        source_credibility: credibility,
        impact_score: impactScore,
      });
      result.signalsMigrated++;
    }

    // --- 6. Migrate users (simplify roles) ---
    const usersSnap = await db.collection("users").get();

    for (const d of usersSnap.docs) {
      const data = d.data();
      const roles: string[] = data.roles ?? [];
      const isReviewer =
        roles.includes("signal-reviewer") ||
        roles.includes("discovery-reviewer") ||
        roles.includes("scoring-reviewer");
      const isAdmin = roles.includes("lead");

      await d.ref.update({
        isReviewer,
        isAdmin,
      });
      result.usersMigrated++;
    }

    // --- 7. Migrate pending discovery proposals → graph_proposals ---
    const discoverySnap = await db
      .collection("discovery_proposals")
      .where("status", "==", "pending")
      .get();

    for (const d of discoverySnap.docs) {
      const data = d.data();
      await db.doc(`graph_proposals/${d.id}`).set({
        id: d.id,
        proposal_type: "new_node",
        node_data: {
          type: data.type === "new_risk" ? "risk" : "solution",
          name: data.proposed_name ?? "",
          description: data.description ?? "",
          why_novel: data.why_novel ?? "",
          key_themes: data.key_themes ?? [],
          suggested_parent_risk_id: data.suggested_parent_risk_id ?? null,
        },
        supporting_signal_ids: data.supporting_signal_ids ?? [],
        confidence: 0.7,
        created_by: "discovery-agent",
        status: "pending",
        created_at: data.created_at ?? FieldValue.serverTimestamp(),
      });
    }

    // --- 8. Migrate pending validation proposals → graph_proposals ---
    const validationSnap = await db
      .collection("validation_proposals")
      .where("status", "==", "pending")
      .get();

    for (const d of validationSnap.docs) {
      const data = d.data();
      await db.doc(`graph_proposals/${d.id}`).set({
        id: d.id,
        proposal_type: "update_node",
        update_data: {
          node_id: data.document_id ?? "",
          node_name: data.document_name ?? "",
          proposed_changes: data.proposed_changes ?? {},
          overall_reasoning: data.overall_reasoning ?? "",
        },
        supporting_signal_ids: data.supporting_signal_ids ?? [],
        confidence: data.confidence ?? 0.6,
        created_by: "validator-agent",
        status: "pending",
        created_at: data.created_at ?? FieldValue.serverTimestamp(),
      });
    }

    return result;
  }
);
