import { useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Globe } from "../components/Globe";
import { Suspense, useState } from "react";
import { PrivacyModal } from "../components/PrivacyModal";
import Layout from "../components/shared/Layout";
import RiskReels from "../components/landing/RiskBadges";
import NewsFeed from "../components/landing/NewsFeed";
import PreferencePicker from "../components/shared/PreferencePicker";

export default function HeroPage() {
  const navigate = useNavigate();
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const handleEnter = () => {
    navigate("/observatory");
  };

  return (
    <Layout>
      <div className="relative w-full overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {/* 3D Background — full viewport height */}
        <div className="absolute inset-0 z-0 opacity-60 h-screen pointer-events-none">
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
            <Suspense fallback={null}>
              <Globe />
            </Suspense>
          </Canvas>
        </div>

        {/* Hero Section */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4 py-16">
          {/* Hero statement */}
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-structural)] mb-4 font-medium">
            Real-time AI risk intelligence
          </p>
          <h1
            className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Are we shaping AI, <br />
            or is it shaping us?
          </h1>

          <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-xl font-light">
            Track 40+ existential shifts redefining human society — curated by
            AI, reviewed by humans.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 mb-12">
            <button
              onClick={() => setShowDisclaimer(true)}
              className="px-7 py-3.5 text-sm font-semibold tracking-wider uppercase border-2 border-[var(--accent-structural)] text-[var(--accent-structural)] hover:bg-[var(--accent-structural)] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(42,157,255,0.25)] rounded"
            >
              Enter Observatory
            </button>
            <button
              onClick={() => navigate("/about")}
              className="px-7 py-3.5 text-sm font-semibold tracking-wider uppercase border-2 border-white/20 text-gray-300 hover:bg-white/10 transition-all duration-300 rounded"
            >
              Learn More
            </button>
          </div>

          {/* Risk Reels */}
          <div className="w-full max-w-2xl">
            <RiskReels />
          </div>
        </div>

        {/* Below the fold: Signal Feed */}
        <div className="relative z-10 max-w-3xl mx-auto px-4 pb-12 space-y-8">
          <NewsFeed />
          <PreferencePicker />
        </div>
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
