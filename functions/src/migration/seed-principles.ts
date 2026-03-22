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

// Initial principle → node mapping (semantic best-fit)
const PRINCIPLE_EDGES: Array<{ principle: string; node: string; relationship: string }> = [
  { principle: "P01", node: "R01", relationship: "governs" },
  { principle: "P02", node: "R02", relationship: "governs" },
  { principle: "P03", node: "R03", relationship: "governs" },
  { principle: "P04", node: "R04", relationship: "governs" },
  { principle: "P05", node: "R05", relationship: "governs" },
  { principle: "P06", node: "R06", relationship: "governs" },
  { principle: "P07", node: "R07", relationship: "governs" },
  { principle: "P08", node: "R08", relationship: "governs" },
  { principle: "P09", node: "R09", relationship: "governs" },
  { principle: "P10", node: "R10", relationship: "governs" },
  { principle: "P01", node: "S01", relationship: "governs" },
  { principle: "P02", node: "S02", relationship: "governs" },
  { principle: "P03", node: "S03", relationship: "governs" },
  { principle: "P04", node: "S04", relationship: "governs" },
  { principle: "P05", node: "S05", relationship: "governs" },
  { principle: "P06", node: "S06", relationship: "governs" },
  { principle: "P07", node: "S07", relationship: "governs" },
  { principle: "P08", node: "S08", relationship: "governs" },
  { principle: "P09", node: "S09", relationship: "governs" },
  { principle: "P10", node: "S10", relationship: "governs" },
];

export const seedPrinciples = onRequest(
  { memory: "256MiB", timeoutSeconds: 60 },
  async (_req, res) => {
    const db = getFirestore();
    const batch = db.batch();
    let created = 0;

    // Create principle nodes
    for (const p of PRINCIPLES) {
      const ref = db.doc(`nodes/${p.id}`);
      const existing = await ref.get();
      if (existing.exists) {
        logger.info(`Principle ${p.id} already exists, skipping`);
        continue;
      }
      batch.set(ref, {
        id: p.id,
        type: "principle",
        name: p.name,
        summary: p.summary,
        oecd_reference: p.oecd_reference,
        createdAt: FieldValue.serverTimestamp(),
        created_by: "seed",
      });
      created++;
    }

    // Create governs edges
    let edgesCreated = 0;
    for (const edge of PRINCIPLE_EDGES) {
      // Only create if both nodes exist
      const [fromSnap, toSnap] = await Promise.all([
        db.doc(`nodes/${edge.principle}`).get(),
        db.doc(`nodes/${edge.node}`).get(),
      ]);
      // The principle may have just been added in this batch, so check PRINCIPLES array too
      const principleExists = fromSnap.exists || PRINCIPLES.some((p) => p.id === edge.principle);
      if (!principleExists || !toSnap.exists) continue;

      const edgeId = `${edge.principle}-${edge.node}-${edge.relationship}`;
      const edgeRef = db.doc(`edges/${edgeId}`);
      const existingEdge = await edgeRef.get();
      if (existingEdge.exists) continue;

      const toType = toSnap.data()?.type ?? "";
      batch.set(edgeRef, {
        id: edgeId,
        from_node: edge.principle,
        from_type: "principle",
        to_node: edge.node,
        to_type: toType,
        relationship: edge.relationship,
        created_by: "seed",
        createdAt: FieldValue.serverTimestamp(),
      });
      edgesCreated++;
    }

    await batch.commit();
    logger.info(`Seeded ${created} principle nodes and ${edgesCreated} governs edges`);
    res.json({ success: true, created, edgesCreated });
  }
);
