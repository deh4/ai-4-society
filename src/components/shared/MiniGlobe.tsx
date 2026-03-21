import { Suspense, lazy } from "react";

const GlobeCanvas = lazy(() => import("./MiniGlobeCanvas"));

function GlobeFallback() {
  return (
    <div className="w-7 h-7 rounded-full border border-blue-500/20" style={{ background: 'radial-gradient(circle at 35% 30%, rgba(42,157,255,0.15), transparent)' }} />
  );
}

export default function MiniGlobe() {
  return (
    <Suspense fallback={<GlobeFallback />}>
      <div className="w-7 h-7">
        <GlobeCanvas />
      </div>
    </Suspense>
  );
}
