import { useNavigate, Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Globe } from "../components/Globe";
import { Suspense, useState } from "react";
import { PrivacyModal } from "../components/PrivacyModal";
import Layout from "../components/shared/Layout";
import RiskBadges from "../components/landing/RiskBadges";
import NewsFeed from "../components/landing/NewsFeed";
import PreferencePicker from "../components/shared/PreferencePicker";

export default function HeroPage() {
  const navigate = useNavigate();
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const handleEnter = () => {
    navigate("/observatory");
  };

  return (
    <Layout bare>
      <div className="relative w-full min-h-screen overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {/* 3D Background */}
        <div className="absolute inset-0 z-0 opacity-60 h-screen">
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
            <Suspense fallback={null}>
              <Globe />
            </Suspense>
          </Canvas>
        </div>

        {/* Hero Section */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4 py-12">
          <h1
            className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Are we shaping AI, <br />
            or is it shaping us?
          </h1>

          <p className="text-lg md:text-xl text-gray-300 mb-8 md:mb-12 max-w-2xl font-light">
            Real-time tracking of the 40+ existential shifts redefining human
            society.
          </p>

          {/* CTAs */}
          <div className="flex flex-col md:flex-row gap-4 w-full max-w-md md:max-w-4xl mb-8">
            <button
              onClick={() => setShowDisclaimer(true)}
              className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-[var(--accent-structural)] text-[var(--accent-structural)] hover:bg-[var(--accent-structural)] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(42,157,255,0.3)] rounded"
            >
              [ Enter Observatory ]
            </button>
            <button
              onClick={() => navigate("/about")}
              className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-cyan-600 text-cyan-400 hover:bg-cyan-600 hover:text-white transition-all duration-300 rounded"
            >
              What is AI-4-Society?
            </button>
            <button
              onClick={() => navigate("/contribute")}
              className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-green-600 text-green-400 hover:bg-green-600 hover:text-white transition-all duration-300 rounded"
            >
              I want to contribute
            </button>
          </div>

          {/* Risk Badges */}
          <div className="w-full max-w-2xl">
            <RiskBadges />
          </div>
        </div>

        {/* Below the fold: News Feed */}
        <div className="relative z-10 max-w-3xl mx-auto px-4 pb-12 space-y-8">
          <NewsFeed />
          <PreferencePicker />
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/10 py-6 px-4 text-center text-xs text-gray-500">
          <Link to="/about" className="hover:text-white transition-colors mr-4">
            About
          </Link>
          <Link
            to="/observatory"
            className="hover:text-white transition-colors mr-4"
          >
            Observatory
          </Link>
          <span>&copy; {new Date().getFullYear()} AI 4 Society</span>
        </footer>
      </div>

      {showDisclaimer && (
        <PrivacyModal
          onClose={() => setShowDisclaimer(false)}
          onConfirm={handleEnter}
        />
      )}
    </Layout>
  );
}
