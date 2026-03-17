import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGraph } from "../../store/GraphContext";
import {
  getLocalPreferences,
  savePreferences,
  hasPreferences,
} from "../../lib/preferences";

const TYPE_COLORS: Record<string, string> = {
  risk: "border-red-500/50 bg-red-500/10 text-red-400",
  solution: "border-green-500/50 bg-green-500/10 text-green-400",
};

const DISMISSED_KEY = "ai4s_prefs_dismissed";

export default function PreferencePicker() {
  const { snapshot } = useGraph();
  const [visible, setVisible] = useState(
    () => !hasPreferences() && localStorage.getItem(DISMISSED_KEY) !== "1"
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(getLocalPreferences().interests)
  );

  if (!visible || !snapshot) return null;

  const nodes = snapshot.nodes.filter(
    (n) => n.type === "risk" || n.type === "solution"
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    savePreferences({ interests: [...selected] });
    setVisible(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        className="bg-white/5 border border-white/10 rounded-lg p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Pick your interests</h3>
          <button
            onClick={() => {
              localStorage.setItem(DISMISSED_KEY, "1");
              setVisible(false);
            }}
            className="text-xs text-gray-500 hover:text-white"
          >
            Skip
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Select topics you care about to personalize your feed.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => toggle(node.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                selected.has(node.id)
                  ? TYPE_COLORS[node.type] ?? "border-white/30 bg-white/10"
                  : "border-white/10 text-gray-500 hover:border-white/30"
              }`}
            >
              {node.name}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <button
            onClick={save}
            className="text-xs px-4 py-2 rounded bg-[var(--accent-structural)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            Save ({selected.size} selected)
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
