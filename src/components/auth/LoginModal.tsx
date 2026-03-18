import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../store/AuthContext";

interface LoginModalProps {
  onClose: () => void;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginModal({ onClose }: LoginModalProps) {
  const { signIn, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-close once authenticated
  useEffect(() => {
    if (user) onClose();
  }, [user, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn();
      // onClose fires via the useEffect above when user state updates
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("popup-closed-by-user") && !msg.includes("cancelled-popup-request")) {
        setError("Sign-in failed. Please try again.");
      }
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="login-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          key="login-card"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="relative bg-[#080f1c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-structural)] to-transparent opacity-60" />

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>

          <div className="px-8 pt-10 pb-8 flex flex-col items-center text-center gap-6">
            {/* Brand mark */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full border border-[var(--accent-structural)]/40 bg-[var(--accent-structural)]/10 flex items-center justify-center mb-1">
                <span className="text-[var(--accent-structural)] text-base font-bold leading-none select-none">
                  A4
                </span>
              </div>
              <h2 className="text-lg font-bold tracking-wide text-white">
                AI 4 Society
              </h2>
              <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--accent-structural)]">
                Observatory
              </p>
            </div>

            {/* Value prop */}
            <div className="space-y-1.5">
              <p className="text-sm text-gray-300 leading-relaxed">
                Sign in to vote on risks, track signals, and shape how AI's impact is understood.
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-white/5" />

            {/* Google button */}
            <div className="w-full flex flex-col gap-3">
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
              >
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-gray-400 border-t-gray-700 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                {loading ? "Signing in…" : "Continue with Google"}
              </button>

              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}
            </div>

            {/* Footer note */}
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Your identity is only used for access control.<br />
              Public Observatory data is always visible without sign-in.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
