import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { DiscoveryProposal } from "./analyzer.js";

/** Normalize a name for fuzzy dedup comparison */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Check if two proposal names are similar enough to be duplicates */
function isSimilarName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  // Exact match after normalization
  if (na === nb) return true;

  // Check if one contains the other (catches "AI Governance" vs "AI Governance Fragmentation")
  if (na.includes(nb) || nb.includes(na)) return true;

  // Word overlap: if 60%+ of words overlap, treat as duplicate
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  const overlap = [...wordsA].filter((w) => wordsB.has(w)).length;
  const minSize = Math.min(wordsA.size, wordsB.size);
  return overlap / minSize >= 0.6;
}

export async function storeDiscoveryProposals(proposals: DiscoveryProposal[]): Promise<number> {
  if (proposals.length === 0) return 0;

  const db = getFirestore();
  const col = db.collection("discovery_proposals");

  // Fetch existing pending proposals to avoid duplicates
  const existingSnap = await col.where("status", "==", "pending").get();
  const existingNames = existingSnap.docs.map(
    (d) => (d.data().proposed_name as string) ?? ""
  );

  let stored = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    // Check for similar existing pending proposals
    const duplicate = existingNames.find((name) =>
      isSimilarName(name, proposal.proposed_name)
    );

    if (duplicate) {
      logger.info(`Discovery: skipping "${proposal.proposed_name}" — similar to existing pending proposal "${duplicate}"`);
      skipped++;
      continue;
    }

    const docData: Record<string, unknown> = {
      type: proposal.type,
      proposed_name: proposal.proposed_name,
      description: proposal.description,
      why_novel: proposal.why_novel,
      key_themes: proposal.key_themes,
      supporting_signal_ids: proposal.supporting_signal_ids,
      signal_count: proposal.supporting_signal_ids.length,
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
      created_by: "discovery-agent",
    };

    if (proposal.suggested_parent_risk_id) {
      docData.suggested_parent_risk_id = proposal.suggested_parent_risk_id;
    }

    await col.add(docData);
    // Track the newly stored name so subsequent proposals in the same batch are also deduped
    existingNames.push(proposal.proposed_name);
    stored++;
  }

  logger.info(`Discovery: stored ${stored} proposals, skipped ${skipped} duplicates`);
  return stored;
}
