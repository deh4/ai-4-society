// src/components/landing/TrustFooter.tsx
import { Link } from "react-router-dom";

export default function TrustFooter() {
  return (
    <footer className="border-t border-white/5 py-8 text-center">
      <p className="text-[10px] text-gray-500 leading-relaxed">
        47 sources across 7 tiers · Human-reviewed signals
        <br />
        Updated every 6 hours · Open methodology
      </p>
      <div className="flex justify-center gap-6 mt-4 text-[10px] text-gray-600">
        <Link to="/about" className="hover:text-white transition-colors">About</Link>
        <Link to="/about#methodology" className="hover:text-white transition-colors">Methodology</Link>
        <Link to="/about#contribute" className="hover:text-white transition-colors">Contribute</Link>
      </div>
      <p className="text-[9px] text-gray-700 mt-4">Not financial or legal advice</p>
    </footer>
  );
}
