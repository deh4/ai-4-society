// src/scripts/seed-editorial-hooks.ts
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

initializeApp({ projectId: "ai-4-society", credential: applicationDefault() });
const db = getFirestore();

async function seedEditorialHooks() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Set GEMINI_API_KEY env var");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Read top 10 feed items
  const feedSnap = await db.collection("feed_items")
    .orderBy("impact_score", "desc")
    .limit(10)
    .get();

  console.log(`Found ${feedSnap.size} feed items to seed.`);

  for (const feedDoc of feedSnap.docs) {
    const data = feedDoc.data();
    const hookRef = db.collection("editorial_hooks").doc(feedDoc.id);
    const existing = await hookRef.get();
    if (existing.exists) {
      console.log(`  ${feedDoc.id}: hook already exists, skipping.`);
      continue;
    }

    const prompt = `You are writing a one-sentence editorial hook for a general audience. Given this news signal about AI risks or solutions, explain what it means for ordinary people in plain, urgent language. No jargon. No hedging.

Signal: "${data.title}"
Source: ${data.source_name}

Respond with ONLY the one-sentence hook. No quotes, no prefix.`;

    const result = await model.generateContent(prompt);
    const hookText = result.response.text().trim();

    await hookRef.set({
      signal_id: feedDoc.id,
      signal_title: data.title ?? "",
      hook_text: hookText,
      status: "pending",
      related_node_ids: data.related_node_ids ?? [],
      impact_score: data.impact_score ?? 0,
      source_name: data.source_name ?? "",
      source_credibility: data.source_credibility ?? 0.5,
      published_date: data.published_date ?? "",
      generated_at: FieldValue.serverTimestamp(),
      reviewed_by: null,
      reviewed_at: null,
    });

    console.log(`  ${feedDoc.id}: "${data.title}" → hook generated`);
  }

  console.log("Seed complete. Review hooks in admin panel before deploying new landing page.");
}

seedEditorialHooks()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Error:", e); process.exit(1); });
