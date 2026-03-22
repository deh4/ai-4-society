export default function MiniGlobe() {
  return (
    <div className="relative w-10 h-10 shrink-0" aria-hidden="true">
      <img
        src="/logo.png"
        alt=""
        className="w-full h-full object-contain relative z-10"
      />
      {/* Beacon pulse rings */}
      <span className="absolute inset-0 rounded-full border border-cyan-400/40 animate-beacon-1" />
      <span className="absolute inset-0 rounded-full border border-cyan-400/20 animate-beacon-2" />
    </div>
  );
}
