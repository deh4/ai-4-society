import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

type DocWithId = Record<string, unknown> & { id: string };

export async function getAllNodes(): Promise<DocWithId[]> {
  const snap = await db.collection("nodes").get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function getAllEdges(): Promise<DocWithId[]> {
  const snap = await db.collection("edges").get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function getNodesByType(type: string): Promise<DocWithId[]> {
  const snap = await db.collection("nodes").where("type", "==", type).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function getSignalsByStatus(
  statuses: string[],
  days: number
): Promise<DocWithId[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const snap = await db
    .collection("signals")
    .where("status", "in", statuses)
    .where("fetched_at", ">=", cutoff)
    .get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function getSignalsForNode(nodeId: string, status?: string): Promise<DocWithId[]> {
  let q = db
    .collection("signals")
    .where("related_node_ids", "array-contains", nodeId);
  if (status) {
    q = q.where("status", "==", status);
  }
  const snap = await q.get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function writeGraphSnapshot(snapshot: object) {
  await db.doc("graph_snapshot/current").set({
    ...snapshot,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function writeNodeSummary(nodeId: string, summary: object) {
  await db.doc(`node_summaries/${nodeId}`).set({
    ...summary,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function writeFeedItems(items: Array<{ id: string } & Record<string, unknown>>) {
  const batch = db.batch();
  for (const item of items) {
    batch.set(db.doc(`feed_items/${item.id}`), item);
  }
  await batch.commit();
}

export async function deleteCollection(collectionPath: string, batchSize = 500) {
  const snap = await db.collection(collectionPath).limit(batchSize).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size === batchSize) {
    await deleteCollection(collectionPath, batchSize);
  }
}

export { db, FieldValue };
