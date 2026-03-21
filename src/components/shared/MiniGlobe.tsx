import { Suspense, lazy } from "react";

const GlobeCanvas = lazy(() => import("./MiniGlobeCanvas"));

function GlobeFallback() {
  return (
    <div className="w-7 h-7 rounded-full border border-blue-500/20 bg-gradient-radial from-blue-500/10 to-transparent" />
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
