import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  bare?: boolean;
}

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/observatory", label: "Observatory" },
  { to: "/about", label: "About" },
];

export default function Layout({ children, bare }: LayoutProps) {
  const { user, userDoc, signIn, logOut } = useAuth();
  const location = useLocation();

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[var(--bg-primary)]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm font-bold tracking-wider uppercase">
              AI 4 Society
            </Link>
            <div className="hidden sm:flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-xs tracking-wide transition-colors ${
                    location.pathname === link.to
                      ? "text-[var(--accent-structural)]"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {userDoc && (
                  <Link to="/admin" className="text-xs text-gray-400 hover:text-white transition-colors">
                    Admin
                  </Link>
                )}
                <span className="text-xs text-gray-500 hidden sm:inline truncate max-w-[120px]">
                  {user.displayName ?? user.email}
                </span>
                <button onClick={logOut} className="text-xs text-gray-400 hover:text-white transition-colors">
                  Sign Out
                </button>
              </>
            ) : (
              <button onClick={signIn} className="text-xs px-3 py-1.5 rounded border border-white/20 text-gray-300 hover:bg-white/10 transition-colors">
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1"
      >
        {children}
      </motion.main>

      <footer className="border-t border-white/10 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <Link to="/about" className="hover:text-white transition-colors">About</Link>
            <Link to="/observatory" className="hover:text-white transition-colors">Observatory</Link>
            <a href="https://github.com/ai-4-society" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>
          <span>&copy; {new Date().getFullYear()} AI 4 Society</span>
        </div>
      </footer>
    </div>
  );
}
