import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const PRINCIPLES = [
  { id: "P01", name: "Accountability", summary: "Responsible parties, liability, oversight mechanisms for AI systems", oecd_reference: "OECD 1.5" },
  { id: "P02", name: "Fairness & Non-discrimination", summary: "Bias prevention, equitable access, non-discriminatory AI outcomes", oecd_reference: "OECD 1.2(b)" },
  { id: "P03", name: "Transparency & Explainability", summary: "Interpretable AI decisions, disclosure of AI use, audit trails", oecd_reference: "OECD 1.3" },
  { id: "P04", name: "Safety & Robustness", summary: "Reliable AI systems, failure mode management, security against attacks", oecd_reference: "OECD 1.4" },
  { id: "P05", name: "Privacy & Data Governance", summary: "Data protection, consent, surveillance boundaries, data minimization", oecd_reference: "OECD 1.2(a)" },
  { id: "P06", name: "Human Oversight & Autonomy", summary: "Human-in-the-loop controls, meaningful human agency over AI decisions", oecd_reference: "OECD 1.4 + 1.5" },
  { id: "P07", name: "Sustainability & Environment", summary: "Environmental impact of AI compute, resource efficiency, climate considerations", oecd_reference: "OECD 1.1 (2024)" },
  { id: "P08", name: "Inclusive Growth & Wellbeing", summary: "Broad societal benefit, reduced inequality, mental health impacts", oecd_reference: "OECD 1.1" },
  { id: "P09", name: "Democracy & Rule of Law", summary: "Electoral integrity, free speech, information ecosystem health", oecd_reference: "OECD 2.2" },
  { id: "P10", name: "International Cooperation", summary: "Cross-border AI governance, standards harmonization, treaty frameworks", oecd_reference: "OECD 2.4" },
];

// Semantic mapping: principle → risk and solution node IDs
// R01-R10: risks, S01-S10: solutions
// Based on OECD principle themes mapped to typical AI risk/solution taxonomy
const PRINCIPLE_EDGES: Array<{
  principleId: string;
  targetId: string;
  targetType: "risk" | "solution";
}> = [
  // P01 Accountability → risks around lack of accountability, autonomous systems; solutions around governance
  { principleId: "P01", targetId: "R01", targetType: "risk" },
  { principleId: "P01", targetId: "R06", targetType: "risk" },
  { principleId: "P01", targetId: "S01", targetType: "solution" },
  { principleId: "P01", targetId: "S06", targetType: "solution" },

  // P02 Fairness & Non-discrimination → bias risks; fairness solutions
  { principleId: "P02", targetId: "R02", targetType: "risk" },
  { principleId: "P02", targetId: "R07", targetType: "risk" },
  { principleId: "P02", targetId: "S02", targetType: "solution" },
  { principleId: "P02", targetId: "S07", targetType: "solution" },

  // P03 Transparency & Explainability → opacity/black-box risks; explainability solutions
  { principleId: "P03", targetId: "R03", targetType: "risk" },
  { principleId: "P03", targetId: "R08", targetType: "risk" },
  { principleId: "P03", targetId: "S03", targetType: "solution" },
  { principleId: "P03", targetId: "S08", targetType: "solution" },

  // P04 Safety & Robustness → safety/security risks; technical safety solutions
  { principleId: "P04", targetId: "R04", targetType: "risk" },
  { principleId: "P04", targetId: "R09", targetType: "risk" },
  { principleId: "P04", targetId: "S04", targetType: "solution" },
  { principleId: "P04", targetId: "S09", targetType: "solution" },

  // P05 Privacy & Data Governance → surveillance/privacy risks; data governance solutions
  { principleId: "P05", targetId: "R05", targetType: "risk" },
  { principleId: "P05", targetId: "R02", targetType: "risk" },
  { principleId: "P05", targetId: "S05", targetType: "solution" },
  { principleId: "P05", targetId: "S02", targetType: "solution" },

  // P06 Human Oversight & Autonomy → autonomous decision-making risks; human oversight solutions
  { principleId: "P06", targetId: "R06", targetType: "risk" },
  { principleId: "P06", targetId: "R01", targetType: "risk" },
  { principleId: "P06", targetId: "S06", targetType: "solution" },
  { principleId: "P06", targetId: "S01", targetType: "solution" },

  // P07 Sustainability & Environment → environmental/resource risks; green AI solutions
  { principleId: "P07", targetId: "R07", targetType: "risk" },
  { principleId: "P07", targetId: "R10", targetType: "risk" },
  { principleId: "P07", targetId: "S07", targetType: "solution" },
  { principleId: "P07", targetId: "S10", targetType: "solution" },

  // P08 Inclusive Growth & Wellbeing → inequality/job displacement risks; inclusion solutions
  { principleId: "P08", targetId: "R08", targetType: "risk" },
  { principleId: "P08", targetId: "R02", targetType: "risk" },
  { principleId: "P08", targetId: "S08", targetType: "solution" },
  { principleId: "P08", targetId: "S02", targetType: "solution" },

  // P09 Democracy & Rule of Law → disinformation/electoral risks; democratic governance solutions
  { principleId: "P09", targetId: "R09", targetType: "risk" },
  { principleId: "P09", targetId: "R03", targetType: "risk" },
  { principleId: "P09", targetId: "S09", targetType: "solution" },
  { principleId: "P09", targetId: "S03", targetType: "solution" },

  // P10 International Cooperation → arms race/standards fragmentation risks; multilateral solutions
  { principleId: "P10", targetId: "R10", targetType: "risk" },
  { principleId: "P10", targetId: "R04", targetType: "risk" },
  { principleId: "P10", targetId: "S10", targetType: "solution" },
  { principleId: "P10", targetId: "S04", targetType: "solution" },
];

export const seedPrinciples = onRequest(
  { memory: "256MiB", timeoutSeconds: 120 },
  async (_req, res) => {
    const db = getFirestore();
    const result = { nodesCreated: 0, nodesSkipped: 0, edgesCreated: 0, edgesSkipped: 0 };

    // --- 1. Seed principle nodes ---
    for (const principle of PRINCIPLES) {
      const ref = db.doc(`nodes/${principle.id}`);
      const snap = await ref.get();

      if (snap.exists) {
        logger.info(`seedPrinciples: node ${principle.id} already exists, skipping`);
        result.nodesSkipped++;
        continue;
      }

      await ref.set({
        id: principle.id,
        type: "principle",
        name: principle.name,
        summary: principle.summary,
        oecd_reference: principle.oecd_reference,
        createdAt: FieldValue.serverTimestamp(),
      });

      logger.info(`seedPrinciples: created node ${principle.id}`);
      result.nodesCreated++;
    }

    // --- 2. Seed governs edges ---
    for (const edge of PRINCIPLE_EDGES) {
      const edgeId = `${edge.principleId}-${edge.targetId}-governs`;
      const ref = db.doc(`edges/${edgeId}`);
      const snap = await ref.get();

      if (snap.exists) {
        logger.info(`seedPrinciples: edge ${edgeId} already exists, skipping`);
        result.edgesSkipped++;
        continue;
      }

      await ref.set({
        id: edgeId,
        from_node: edge.principleId,
        from_type: "principle",
        to_node: edge.targetId,
        to_type: edge.targetType,
        relationship: "governs",
        properties: { strength: 1.0 },
        created_by: "migration-v3",
        createdAt: FieldValue.serverTimestamp(),
      });

      logger.info(`seedPrinciples: created edge ${edgeId}`);
      result.edgesCreated++;
    }

    logger.info("seedPrinciples: complete", result);
    res.json({ success: true, ...result });
  }
);
