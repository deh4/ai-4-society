// functions/src/agents/discovery/store.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { DiscoveryProposal } from "./analyzer.js";

/** Normalize a name for fuzzy comparison */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Check if two names are similar enough to be duplicates (60%+ word overlap) */
function isSimilarName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  const overlap = [...wordsA].filter((w) => wordsB.has(w)).length;
  const minSize = Math.min(wordsA.size, wordsB.size);
  return overlap / minSize >= 0.6;
}

export async function storeDiscoveryProposals(
  proposals: DiscoveryProposal[],
  existingNodeNames: string[] = [],
): Promise<number> {
  if (proposals.length === 0) return 0;

  const db = getFirestore();
  const col = db.collection("graph_proposals");

  // Fetch existing pending proposals for dedup
  const existingSnap = await col.where("status", "==", "pending").get();
  const existingNames: string[] = [...existingNodeNames]; // Include current graph node names
  const existingEdges: Array<{ from: string; to: string; rel: string }> = [];

  for (const d of existingSnap.docs) {
    const data = d.data();
    if (data.proposal_type === "new_node" && data.node_data?.name) {
      existingNames.push(data.node_data.name as string);
    }
    if (data.proposal_type === "new_edge" && data.edge_data) {
      existingEdges.push({
        from: data.edge_data.from_node as string,
        to: data.edge_data.to_node as string,
        rel: data.edge_data.relationship as string,
      });
    }
  }

  let stored = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    if (proposal.proposal_type === "new_node") {
      // Check for similar existing pending node proposals
      const name = proposal.node_data.name;
      const duplicate = existingNames.find((n) => isSimilarName(n, name));
      if (duplicate) {
        logger.info(`Discovery: skipping "${name}" — similar to pending "${duplicate}"`);
        skipped++;
        continue;
      }

      // Store full node skeleton (including summary, deep_dive, scores, etc.)
      await col.add({
        proposal_type: "new_node",
        node_data: {
          ...proposal.node_data,
        },
        supporting_signal_ids: proposal.supporting_signal_ids,
        confidence: proposal.confidence,
        signal_quality: proposal.signal_quality ?? null,
        created_by: "discovery-agent",
        status: "pending",
        created_at: FieldValue.serverTimestamp(),
      });
      existingNames.push(name);
      stored++;
    } else if (proposal.proposal_type === "new_edge") {
      // Check for duplicate edge proposals
      const isDuplicate = existingEdges.some(
        (e) =>
          e.from === proposal.edge_data.from_node &&
          e.to === proposal.edge_data.to_node &&
          e.rel === proposal.edge_data.relationship
      );
      if (isDuplicate) {
        logger.info(`Discovery: skipping edge ${proposal.edge_data.from_node}->${proposal.edge_data.to_node} — already pending`);
        skipped++;
        continue;
      }

      await col.add({
        proposal_type: "new_edge",
        edge_data: proposal.edge_data,
        supporting_signal_ids: proposal.supporting_signal_ids,
        confidence: proposal.confidence,
        signal_quality: proposal.signal_quality ?? null,
        created_by: "discovery-agent",
        status: "pending",
        created_at: FieldValue.serverTimestamp(),
      });
      existingEdges.push({
        from: proposal.edge_data.from_node,
        to: proposal.edge_data.to_node,
        rel: proposal.edge_data.relationship,
      });
      stored++;
    }
  }

  logger.info(`Discovery: stored ${stored} proposals, skipped ${skipped} duplicates`);
  return stored;
}
