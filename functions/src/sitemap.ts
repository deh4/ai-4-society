import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/** Convert a node name to a URL-safe slug (mirrors src/lib/slugs.ts). */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Serves a dynamic sitemap.xml built from the live graph_snapshot.
 * Every node gets its own <url> entry under /observatory/{slug}.
 * Cache: 6 hours (matches Signal Scout cadence).
 */
export const sitemap = onRequest(
  { cors: false, memory: "256MiB" },
  async (_req, res) => {
    const db = getFirestore();
    const snap = await db.doc("graph_snapshot/current").get();

    const today = new Date().toISOString().slice(0, 10);

    // Static routes
    const urls: Array<{ loc: string; changefreq: string; priority: string; lastmod: string }> = [
      { loc: "https://ai4society.io/", changefreq: "weekly", priority: "1.0", lastmod: today },
      { loc: "https://ai4society.io/observatory", changefreq: "daily", priority: "0.9", lastmod: today },
      { loc: "https://ai4society.io/about", changefreq: "monthly", priority: "0.7", lastmod: today },
    ];

    // Dynamic node routes from graph snapshot
    if (snap.exists) {
      const data = snap.data()!;
      const nodes = (data.nodes || []) as Array<{ name: string; type: string }>;

      for (const node of nodes) {
        const slug = toSlug(node.name);
        const priority = node.type === "risk" || node.type === "solution" ? "0.8" : "0.6";
        urls.push({
          loc: `https://ai4society.io/observatory/${slug}`,
          changefreq: "daily",
          priority,
          lastmod: today,
        });
      }
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      ),
      "</urlset>",
    ].join("\n");

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=21600"); // 6 hours
    res.status(200).send(xml);
  }
);
