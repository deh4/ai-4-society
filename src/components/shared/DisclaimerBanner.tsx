import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "ai4s_disclaimer_acknowledged";

export default function DisclaimerBanner() {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-blue-500/5 border-b border-blue-500/10 px-4 py-2 flex items-center justify-between gap-4"
        >
          <p className="text-[10px] text-gray-400">
            This platform is for awareness and transparency. Not financial or legal advice.
          </p>
          <button
            onClick={dismiss}
            className="text-[10px] text-gray-500 hover:text-white shrink-0"
          >
            Dismiss
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
