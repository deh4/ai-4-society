export interface DataSource {
  id: string;
  name: string;
  type: "rss" | "api";
  url: string;
  category?: string;
  maxItems?: number; // Per-source cap for feed balancing
}

export const DATA_SOURCES: DataSource[] = [
  // ── Research ────────────────────────────────────────────────
  {
    id: "arxiv-ai",
    name: "arXiv CS.AI",
    type: "rss",
    url: "https://rss.arxiv.org/rss/cs.AI",
    category: "Research",
    maxItems: 15,
  },
  // ── Journalism ──────────────────────────────────────────────
  {
    id: "mit-tech-review",
    name: "MIT Technology Review",
    type: "rss",
    url: "https://www.technologyreview.com/feed/",
    category: "Journalism",
  },
  {
    id: "ars-ai",
    name: "Ars Technica AI",
    type: "rss",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    category: "Journalism",
  },
  {
    id: "verge-ai",
    name: "The Verge AI",
    type: "rss",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    category: "Journalism",
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    type: "rss",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    category: "Journalism",
  },
  {
    id: "wired-ai",
    name: "Wired AI",
    type: "rss",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    category: "Journalism",
  },
  // ── Newsletters ─────────────────────────────────────────────
  {
    id: "tldr-ai",
    name: "TLDR AI",
    type: "rss",
    url: "https://bullrich.dev/tldr-rss/ai.rss",
    category: "Newsletter",
    maxItems: 20,
  },
  {
    id: "import-ai",
    name: "Import AI",
    type: "rss",
    url: "https://importai.substack.com/feed",
    category: "Newsletter",
  },
  {
    id: "last-week-in-ai",
    name: "Last Week in AI",
    type: "rss",
    url: "https://lastweekin.ai/feed",
    category: "Newsletter",
  },
  // ── Global Events ───────────────────────────────────────────
  {
    id: "gdelt-ai",
    name: "GDELT DOC API",
    type: "api",
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=artificial+intelligence+risk&mode=ArtList&maxrecords=20&format=json",
    category: "Global Events",
  },
];
