export interface DataSource {
  id: string;
  name: string;
  type: "rss" | "api";
  url: string;
  category?: string;
  maxItems?: number; // Per-source cap for feed balancing
  credibility: number; // 0-1, default used when no admin override
  tier: 1 | 2 | 3 | 4 | 5;
}

export const DATA_SOURCES: DataSource[] = [
  // ── Research & Safety ────────────────────────────────────────
  {
    id: "arxiv-ai",
    name: "arXiv CS.AI",
    type: "rss",
    url: "https://rss.arxiv.org/rss/cs.AI",
    category: "Research",
    maxItems: 15,
    credibility: 0.85,
    tier: 1,
  },
  {
    id: "alignment-forum",
    name: "Alignment Forum",
    type: "rss",
    url: "https://www.alignmentforum.org/feed.xml",
    category: "Research",
    maxItems: 10,
    credibility: 0.85,
    tier: 1,
  },
  {
    id: "cais-newsletter",
    name: "AI Safety Newsletter (CAIS)",
    type: "rss",
    url: "https://newsletter.safe.ai/feed",
    category: "Research",
    credibility: 0.85,
    tier: 1,
  },
  {
    id: "nature-mach-intel",
    name: "Nature Machine Intelligence",
    type: "rss",
    url: "https://www.nature.com/natmachintell.rss",
    category: "Research",
    maxItems: 10,
    credibility: 0.90,
    tier: 1,
  },
  {
    id: "ai-now-institute",
    name: "AI Now Institute",
    type: "rss",
    url: "https://ainowinstitute.org/category/news/feed",
    category: "Research",
    credibility: 0.85,
    tier: 1,
  },
  // ── Journalism ──────────────────────────────────────────────
  {
    id: "mit-tech-review",
    name: "MIT Technology Review",
    type: "rss",
    url: "https://www.technologyreview.com/feed/",
    category: "Journalism",
    credibility: 0.80,
    tier: 2,
  },
  {
    id: "wired-ai",
    name: "Wired AI",
    type: "rss",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    category: "Journalism",
    credibility: 0.75,
    tier: 2,
  },
  {
    id: "ars-ai",
    name: "Ars Technica AI",
    type: "rss",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    category: "Journalism",
    credibility: 0.75,
    tier: 2,
  },
  {
    id: "ieee-spectrum-ai",
    name: "IEEE Spectrum AI",
    type: "rss",
    url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
    category: "Journalism",
    credibility: 0.80,
    tier: 2,
  },
  {
    id: "guardian-ai",
    name: "The Guardian AI",
    type: "rss",
    url: "https://www.theguardian.com/technology/artificialintelligenceai/rss",
    category: "Journalism",
    credibility: 0.75,
    tier: 2,
  },
  // ── Tech / Community ────────────────────────────────────────
  {
    id: "verge-ai",
    name: "The Verge AI",
    type: "rss",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    category: "Tech / Community",
    credibility: 0.65,
    tier: 3,
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    type: "rss",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    category: "Tech / Community",
    credibility: 0.60,
    tier: 3,
  },
  // ── Active Search ───────────────────────────────────────────
  {
    id: "gdelt-ai",
    name: "GDELT DOC API",
    type: "api",
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=artificial+intelligence+risk&mode=ArtList&maxrecords=20&format=json",
    category: "Active Search",
    credibility: 0.50,
    tier: 4,
  },
  // ── Newsletters ─────────────────────────────────────────────
  {
    id: "tldr-ai",
    name: "TLDR AI",
    type: "rss",
    url: "https://bullrich.dev/tldr-rss/ai.rss",
    category: "Newsletter",
    maxItems: 20,
    credibility: 0.65,
    tier: 5,
  },
  {
    id: "import-ai",
    name: "Import AI",
    type: "rss",
    url: "https://importai.substack.com/feed",
    category: "Newsletter",
    credibility: 0.70,
    tier: 5,
  },
  {
    id: "last-week-in-ai",
    name: "Last Week in AI",
    type: "rss",
    url: "https://lastweekin.ai/feed",
    category: "Newsletter",
    credibility: 0.65,
    tier: 5,
  },
  {
    id: "bens-bites",
    name: "Ben's Bites",
    type: "rss",
    url: "https://www.bensbites.com/feed",
    category: "Newsletter",
    credibility: 0.65,
    tier: 5,
  },
];
