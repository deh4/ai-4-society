import { Helmet } from "react-helmet-async";
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
      <Helmet>
        <title>AI 4 Society Observatory — Humanity's window into AI's trajectory</title>
        <meta name="description" content="Real-time observatory tracking 40+ risks and solutions as AI reshapes society. Signals curated by AI, reviewed by humans. Monitor AI safety, governance, economic displacement, and more." />
        <link rel="canonical" href="https://ai4society.io/" />
        <meta property="og:url" content="https://ai4society.io/" />
        <meta property="og:title" content="AI 4 Society Observatory — Humanity's window into AI's trajectory" />
        <meta property="og:description" content="Real-time observatory tracking 40+ AI risks and solutions. Signals curated by AI, reviewed by humans." />
      </Helmet>
      <div className="relative w-full overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {/* 3D Background — full viewport height */}
        <div className="absolute inset-0 z-0 opacity-60 h-screen pointer-events-none">
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
            <Suspense fallback={null}>
              <Globe />
            </Suspense>
          </Canvas>
        </div>

        {/* Risk Reels — directly below nav, above hero content */}
        <div className="relative z-10 w-full border-b border-white/5 bg-[var(--bg-primary)]/80 backdrop-blur-sm overflow-visible">
          <div className="max-w-7xl mx-auto px-4 py-3 overflow-visible">
            <RiskReels />
          </div>
        </div>

        {/* Hero Section */}
        {/* 3.5rem = nav h-14, ~5rem = reels strip (py-3 + badge height) */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem-5rem)] text-center px-4 py-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-structural)] mb-4 font-medium">
            AI Observatory
          </p>
          <h1
            className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Humanity's window <br />
            into AI's trajectory
          </h1>

          <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-xl font-light">
            40+ tracked risks and solutions, reviewed by humans. Watch how AI is
            reshaping society — in real time.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
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
