import { useState } from "react";
import type { AgentConfig } from "../../data/agentConfig";
import { toggleAgentSource } from "../../data/agentConfig";

// Source metadata — IDs must match functions/src/config/sources.ts exactly
const SOURCE_META: Record<string, { name: string; tier: number; defaultCredibility: number }> = {
  "arxiv-ai":        { name: "arXiv CS.AI",           tier: 1, defaultCredibility: 0.85 },
  "mit-tech-review": { name: "MIT Technology Review", tier: 2, defaultCredibility: 0.80 },
  "wired-ai":        { name: "Wired AI",               tier: 2, defaultCredibility: 0.75 },
  "ars-ai":          { name: "Ars Technica AI",        tier: 2, defaultCredibility: 0.75 },
  "verge-ai":        { name: "The Verge AI",           tier: 3, defaultCredibility: 0.65 },
  "techcrunch-ai":   { name: "TechCrunch AI",          tier: 3, defaultCredibility: 0.60 },
  "tldr-ai":         { name: "TLDR AI",                tier: 5, defaultCredibility: 0.65 },
  "import-ai":       { name: "Import AI",              tier: 5, defaultCredibility: 0.70 },
  "last-week-in-ai": { name: "Last Week in AI",        tier: 5, defaultCredibility: 0.65 },
  "gdelt-ai":        { name: "GDELT DOC API",          tier: 4, defaultCredibility: 0.50 },
};

interface Props {
  agentId: string;
  config: AgentConfig | null;
  uid: string;
}

export function SourceConfigTable({ agentId, config, uid }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);

  const sources = config?.sources ?? {};
  const sourceIds = Object.keys(SOURCE_META);

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/50 text-xs uppercase tracking-wider border-b border-white/10">
            <th className="text-left py-2 px-3">Source</th>
            <th className="text-center py-2 px-3">Tier</th>
            <th className="text-center py-2 px-3">Credibility</th>
            <th className="text-center py-2 px-3">Enabled</th>
          </tr>
        </thead>
        <tbody>
          {sourceIds.map((id) => {
            const meta = SOURCE_META[id];
            const sourceConfig = sources[id];
            const enabled = sourceConfig?.enabled ?? true;
            const credibility = sourceConfig?.credibilityOverride ?? meta.defaultCredibility;

            return (
              <tr
                key={id}
                className="border-b border-white/5 hover:bg-white/5"
              >
                <td className="py-2 px-3 text-white/80">{meta.name}</td>
                <td className="py-2 px-3 text-center text-white/60">T{meta.tier}</td>
                <td className="py-2 px-3 text-center text-white/60">
                  {(credibility * 100).toFixed(0)}%
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => handleToggle(id, !enabled)}
                    disabled={toggling === id}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      enabled ? "bg-green-500/60" : "bg-white/10"
                    } ${toggling === id ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        enabled ? "left-5" : "left-0.5"
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
  );
}
