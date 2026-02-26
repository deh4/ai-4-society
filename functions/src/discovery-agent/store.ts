import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { DiscoveryProposal } from "./analyzer.js";

export async function storeDiscoveryProposals(proposals: DiscoveryProposal[]): Promise<number> {
  if (proposals.length === 0) return 0;

  const db = getFirestore();
  const col = db.collection("discovery_proposals");
  let stored = 0;

  for (const proposal of proposals) {
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
    stored++;
  }

  logger.info(`Discovery: stored ${stored} proposals`);
  return stored;
}
