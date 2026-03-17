import { useState } from "react";
import type { AgentConfig } from "../../data/agentConfig";
import { toggleAgentSource } from "../../data/agentConfig";

// Source metadata — IDs must match functions/src/config/sources.ts exactly
const SOURCE_META: Record<
  string,
  { name: string; tier: number; defaultCredibility: number; category: string }
> = {
  // Research & Safety
  "arxiv-ai":         { name: "arXiv CS.AI",                   tier: 1, defaultCredibility: 0.85, category: "Research & Safety" },
  "alignment-forum":  { name: "Alignment Forum",               tier: 1, defaultCredibility: 0.85, category: "Research & Safety" },
  "cais-newsletter":  { name: "AI Safety Newsletter (CAIS)",   tier: 1, defaultCredibility: 0.85, category: "Research & Safety" },
  "nature-mach-intel":{ name: "Nature Machine Intelligence",   tier: 1, defaultCredibility: 0.90, category: "Research & Safety" },
  "ai-now-institute": { name: "AI Now Institute",              tier: 1, defaultCredibility: 0.85, category: "Research & Safety" },
  // Journalism
  "mit-tech-review":  { name: "MIT Technology Review",         tier: 2, defaultCredibility: 0.80, category: "Journalism" },
  "wired-ai":         { name: "Wired AI",                      tier: 2, defaultCredibility: 0.75, category: "Journalism" },
  "ars-ai":           { name: "Ars Technica AI",               tier: 2, defaultCredibility: 0.75, category: "Journalism" },
  "ieee-spectrum-ai": { name: "IEEE Spectrum AI",              tier: 2, defaultCredibility: 0.80, category: "Journalism" },
  "guardian-ai":      { name: "The Guardian AI",               tier: 2, defaultCredibility: 0.75, category: "Journalism" },
  // Tech / Community
  "verge-ai":         { name: "The Verge AI",                  tier: 3, defaultCredibility: 0.65, category: "Tech / Community" },
  "techcrunch-ai":    { name: "TechCrunch AI",                 tier: 3, defaultCredibility: 0.60, category: "Tech / Community" },
  // Active Search
  "gdelt-ai":         { name: "GDELT DOC API",                 tier: 4, defaultCredibility: 0.50, category: "Active Search" },
  // Newsletters
  "tldr-ai":          { name: "TLDR AI",                       tier: 5, defaultCredibility: 0.65, category: "Newsletter" },
  "import-ai":        { name: "Import AI",                     tier: 5, defaultCredibility: 0.70, category: "Newsletter" },
  "last-week-in-ai":  { name: "Last Week in AI",               tier: 5, defaultCredibility: 0.65, category: "Newsletter" },
  "bens-bites":       { name: "Ben's Bites",                   tier: 5, defaultCredibility: 0.65, category: "Newsletter" },
};

const CATEGORY_ORDER = [
  "Research & Safety",
  "Journalism",
  "Tech / Community",
  "Active Search",
  "Newsletter",
];

const TIER_COLORS: Record<number, string> = {
  1: "text-purple-400",
  2: "text-blue-400",
  3: "text-cyan-400",
  4: "text-orange-400",
  5: "text-yellow-400",
};

interface Props {
  agentId: string;
  config: AgentConfig | null;
  uid: string;
}

export function SourceConfigTable({ agentId, config, uid }: Props) {
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
                  <th className="text-center py-2 px-3 w-12">Tier</th>
                  <th className="text-center py-2 px-3 w-20">Credibility</th>
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
                      <td className={`py-2 px-3 text-center text-[10px] font-mono ${TIER_COLORS[meta.tier]}`}>
                        T{meta.tier}
                      </td>
                      <td className="py-2 px-3 text-center text-white/50 text-xs">
                        {(credibility * 100).toFixed(0)}%
                      </td>
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
