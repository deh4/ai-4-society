import { useState } from "react";
import type { AgentConfig, SourceFetchHealth } from "../../data/agentConfig";
import { toggleAgentSource } from "../../data/agentConfig";

// Source metadata — IDs must match functions/src/config/sources.ts exactly
const SOURCE_META: Record<
  string,
  { name: string; tier: number; defaultCredibility: number; category: string; domain: string }
> = {
  // T0 — Regulatory
  "eu-ai-office":      { name: "EU AI Office / EUR-Lex",        tier: 0, defaultCredibility: 0.93, category: "Regulatory",          domain: "Regulatory" },
  "nist-ai":           { name: "NIST AI / Federal Register",    tier: 0, defaultCredibility: 0.91, category: "Regulatory",          domain: "Regulatory" },
  // T1 — Institutional
  "arxiv-ai":          { name: "arXiv CS.AI",                   tier: 1, defaultCredibility: 0.85, category: "Institutional",       domain: "AI research" },
  "alignment-forum":   { name: "Alignment Forum",               tier: 1, defaultCredibility: 0.85, category: "Institutional",       domain: "AI safety" },
  "cais-newsletter":   { name: "AI Safety Newsletter (CAIS)",   tier: 1, defaultCredibility: 0.85, category: "Institutional",       domain: "AI safety" },
  "nature-mach-intel": { name: "Nature Machine Intelligence",   tier: 1, defaultCredibility: 0.90, category: "Institutional",       domain: "AI research" },
  "ai-now-institute":  { name: "AI Now Institute",              tier: 1, defaultCredibility: 0.85, category: "Institutional",       domain: "AI policy" },
  "future-of-life":    { name: "Future of Life Institute",      tier: 1, defaultCredibility: 0.88, category: "Institutional",       domain: "AI safety" },
  "anthropic-blog":    { name: "Anthropic Research Blog",       tier: 1, defaultCredibility: 0.88, category: "Institutional",       domain: "AI safety" },
  "deepmind-blog":     { name: "Google AI Blog",                 tier: 1, defaultCredibility: 0.85, category: "Institutional",       domain: "AI safety" },
  "aiid":              { name: "AI Incident Database (AIID)",   tier: 1, defaultCredibility: 0.85, category: "Institutional",       domain: "AI harms" },
  "miri-blog":         { name: "MIRI Blog",                     tier: 1, defaultCredibility: 0.82, category: "Institutional",       domain: "AI alignment" },
  "promedmail":        { name: "ProMED (ISID)",                 tier: 1, defaultCredibility: 0.90, category: "Institutional",       domain: "Biosecurity" },
  "who-don":           { name: "WHO Disease Outbreak News",     tier: 1, defaultCredibility: 0.92, category: "Institutional",       domain: "Biosecurity" },
  "crisis-group":      { name: "International Crisis Group",    tier: 1, defaultCredibility: 0.88, category: "Institutional",       domain: "Geopolitical" },
  "wef-agenda":        { name: "WEF Global Risks / Agenda",    tier: 1, defaultCredibility: 0.85, category: "Institutional",       domain: "Geopolitical" },
  "nature-climate":    { name: "Nature Climate Change",         tier: 1, defaultCredibility: 0.90, category: "Institutional",       domain: "Climate" },
  "rand-corp":         { name: "RAND Corporation",              tier: 1, defaultCredibility: 0.87, category: "Institutional",       domain: "Policy / security" },
  "brookings":         { name: "Brookings Institution",         tier: 1, defaultCredibility: 0.87, category: "Institutional",       domain: "Policy / AI" },
  "digichina":         { name: "DigiChina (Stanford FSI)",      tier: 1, defaultCredibility: 0.87, category: "Institutional",       domain: "China / AI policy" },
  // T2 — Journalism
  "mit-tech-review":   { name: "MIT Technology Review",         tier: 2, defaultCredibility: 0.80, category: "Journalism",          domain: "AI journalism" },
  "wired-ai":          { name: "Wired AI",                      tier: 2, defaultCredibility: 0.75, category: "Journalism",          domain: "AI journalism" },
  "ars-ai":            { name: "Ars Technica AI",               tier: 2, defaultCredibility: 0.75, category: "Journalism",          domain: "AI journalism" },
  "ieee-spectrum-ai":  { name: "IEEE Spectrum AI",              tier: 2, defaultCredibility: 0.80, category: "Journalism",          domain: "AI journalism" },
  "guardian-ai":       { name: "The Guardian AI",               tier: 2, defaultCredibility: 0.75, category: "Journalism",          domain: "AI journalism" },
  "stat-news":         { name: "STAT News",                     tier: 2, defaultCredibility: 0.80, category: "Journalism",          domain: "Biosecurity" },
  "carbon-brief":      { name: "Carbon Brief",                  tier: 2, defaultCredibility: 0.82, category: "Journalism",          domain: "Climate" },
  "climate-central":   { name: "Climate Central",               tier: 2, defaultCredibility: 0.78, category: "Journalism",          domain: "Climate" },
  "bellingcat":        { name: "Bellingcat",                     tier: 2, defaultCredibility: 0.78, category: "Journalism",          domain: "Geopolitical" },
  "foreign-policy":    { name: "Foreign Policy",                tier: 2, defaultCredibility: 0.78, category: "Journalism",          domain: "Geopolitical" },
  "platformer":        { name: "Platformer",                    tier: 2, defaultCredibility: 0.78, category: "Journalism",          domain: "AI accountability" },
  // T3 — Community
  "verge-ai":          { name: "The Verge AI",                  tier: 3, defaultCredibility: 0.65, category: "Community",           domain: "AI tech" },
  "techcrunch-ai":     { name: "TechCrunch AI",                 tier: 3, defaultCredibility: 0.60, category: "Community",           domain: "AI tech" },
  "lesswrong":         { name: "LessWrong",                     tier: 3, defaultCredibility: 0.68, category: "Community",           domain: "AI safety community" },
  "ea-forum":          { name: "EA Forum / 80,000 Hours",       tier: 3, defaultCredibility: 0.72, category: "Community",           domain: "AI safety community" },
  // T4 — Search
  "gdelt-ai":          { name: "GDELT DOC API",                 tier: 4, defaultCredibility: 0.50, category: "Search",              domain: "Media monitoring" },
  // T5 — Newsletter
  "tldr-ai":           { name: "TLDR AI",                       tier: 5, defaultCredibility: 0.65, category: "Newsletter",          domain: "AI newsletter" },
  "import-ai":         { name: "Import AI",                     tier: 5, defaultCredibility: 0.70, category: "Newsletter",          domain: "AI newsletter" },
  "last-week-in-ai":   { name: "Last Week in AI",               tier: 5, defaultCredibility: 0.65, category: "Newsletter",          domain: "AI newsletter" },
  "bens-bites":        { name: "Ben's Bites",                   tier: 5, defaultCredibility: 0.65, category: "Newsletter",          domain: "AI newsletter" },
  "chinai-newsletter": { name: "ChinAI Newsletter",             tier: 5, defaultCredibility: 0.72, category: "Newsletter",          domain: "China / AI" },
  "cdc-mmwr":          { name: "CDC / MMWR",                    tier: 5, defaultCredibility: 0.90, category: "Newsletter",          domain: "Biosecurity" },
  // T6 — Data Infrastructure
  "semantic-scholar":  { name: "Semantic Scholar API",           tier: 6, defaultCredibility: 0.65, category: "Data Infrastructure", domain: "Academic search" },
};

const CATEGORY_ORDER = [
  "Regulatory",
  "Institutional",
  "Journalism",
  "Community",
  "Search",
  "Newsletter",
  "Data Infrastructure",
];

const TIER_COLORS: Record<number, string> = {
  0: "text-red-400",
  1: "text-purple-400",
  2: "text-blue-400",
  3: "text-cyan-400",
  4: "text-orange-400",
  5: "text-yellow-400",
  6: "text-emerald-400",
};

const DOMAIN_COLORS: Record<string, string> = {
  "Regulatory":         "bg-red-500/20 text-red-400",
  "AI research":        "bg-purple-500/20 text-purple-400",
  "AI safety":          "bg-violet-500/20 text-violet-400",
  "AI policy":          "bg-indigo-500/20 text-indigo-400",
  "AI alignment":       "bg-violet-500/20 text-violet-400",
  "AI harms":           "bg-rose-500/20 text-rose-400",
  "AI journalism":      "bg-blue-500/20 text-blue-400",
  "AI tech":            "bg-cyan-500/20 text-cyan-400",
  "AI accountability":  "bg-blue-500/20 text-blue-400",
  "AI newsletter":      "bg-yellow-500/20 text-yellow-400",
  "AI safety community":"bg-violet-500/20 text-violet-400",
  "Biosecurity":        "bg-emerald-500/20 text-emerald-400",
  "Climate":            "bg-green-500/20 text-green-400",
  "Geopolitical":       "bg-amber-500/20 text-amber-400",
  "Policy / security":  "bg-indigo-500/20 text-indigo-400",
  "Policy / AI":        "bg-indigo-500/20 text-indigo-400",
  "China / AI policy":  "bg-orange-500/20 text-orange-400",
  "China / AI":         "bg-orange-500/20 text-orange-400",
  "Media monitoring":   "bg-gray-500/20 text-gray-400",
  "News search":        "bg-gray-500/20 text-gray-400",
  "Academic search":    "bg-emerald-500/20 text-emerald-400",
};

interface Props {
  agentId: string;
  config: AgentConfig | null;
  uid: string;
  sourceHealth?: Record<string, SourceFetchHealth>;
}

export function SourceConfigTable({ agentId, config, uid, sourceHealth }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);

  const sources = config?.sources ?? {};

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    sources: Object.entries(SOURCE_META).filter(([, m]) => m.category === cat),
  }));

  const handleToggle = async (sourceId: string, enabled: boolean) => {
    setToggling(sourceId);
    try {
      await toggleAgentSource(agentId, sourceId, enabled, uid);
    } catch (err) {
      console.error("Failed to toggle source:", err);
    }
    setToggling(null);
  };

  return (
    <div className="space-y-6">
      {grouped.map(({ category, sources: catSources }) => (
        <div key={category}>
          <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2 px-1">
            {category}
          </h4>
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-[10px] uppercase tracking-wider border-b border-white/10 bg-white/[0.02]">
                  <th className="text-left py-2 px-3">Source</th>
                  <th className="text-left py-2 px-3 w-24 hidden sm:table-cell">Domain</th>
                  <th className="text-center py-2 px-3 w-12">Tier</th>
                  <th className="text-center py-2 px-3 w-20">Cred.</th>
                  {sourceHealth && <th className="text-center py-2 px-3 w-16">Last</th>}
                  <th className="text-center py-2 px-3 w-16">On</th>
                </tr>
              </thead>
              <tbody>
                {catSources.map(([id, meta], i) => {
                  const sourceConfig = sources[id];
                  const enabled = sourceConfig?.enabled ?? true;
                  const credibility =
                    sourceConfig?.credibilityOverride ?? meta.defaultCredibility;
                  const isLast = i === catSources.length - 1;
                  const domainColor = DOMAIN_COLORS[meta.domain] ?? "bg-white/10 text-white/60";

                  return (
                    <tr
                      key={id}
                      className={`hover:bg-white/5 transition-colors ${
                        isLast ? "" : "border-b border-white/5"
                      }`}
                    >
                      <td className="py-2 px-3 text-white/80 text-xs">
                        {meta.name}
                      </td>
                      <td className="py-2 px-3 hidden sm:table-cell">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${domainColor}`}>
                          {meta.domain}
                        </span>
                      </td>
                      <td className={`py-2 px-3 text-center text-[10px] font-mono ${TIER_COLORS[meta.tier]}`}>
                        T{meta.tier}
                      </td>
                      <td className="py-2 px-3 text-center text-white/50 text-xs">
                        {(credibility * 100).toFixed(0)}%
                      </td>
                      {sourceHealth && (
                        <td className="py-2 px-3 text-center">
                          <SourceHealthDot health={sourceHealth[id]} />
                        </td>
                      )}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => handleToggle(id, !enabled)}
                          disabled={toggling === id}
                          className={`w-9 h-5 rounded-full transition-colors relative ${
                            enabled ? "bg-green-500/60" : "bg-white/10"
                          } ${toggling === id ? "opacity-50" : ""}`}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${meta.name}`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              enabled ? "left-4" : "left-0.5"
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceHealthDot({ health }: { health?: SourceFetchHealth }) {
  if (!health) {
    return <span className="inline-block w-2 h-2 rounded-full bg-white/20" title="No data yet" />;
  }
  if (health.status === "ok") {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-green-500"
        title={`${health.count} articles fetched`}
      />
    );
  }
  if (health.status === "empty") {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-yellow-500"
        title="Fetched OK but 0 articles"
      />
    );
  }
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-red-500"
      title={health.error ?? "Fetch failed"}
    />
  );
}
