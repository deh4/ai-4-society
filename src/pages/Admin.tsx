import { useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useNavigate } from "react-router-dom";
import { canAccessTab } from "../lib/roles";
import type { UserRole } from "../lib/roles";
import PipelineHealth from "../components/PipelineHealth";
import AcknowledgmentModal from "../components/admin/AcknowledgmentModal";
import RiskSignalsTab from "../components/admin/RiskSignalsTab";
import SolutionSignalsTab from "../components/admin/SolutionSignalsTab";
import NewDiscoveryTab from "../components/admin/NewDiscoveryTab";
import ScoringTab from "../components/admin/ScoringTab";
import EditorialReviewTab from "../components/admin/EditorialReviewTab";
import { AgentsSection } from "../components/admin/AgentsSection";
import UsersTab from "../components/admin/UsersTab";

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type AdminSection =
  | "risk-signals"
  | "solution-signals"
  | "discovery"
  | "scoring"
  | "editorial"
  | "agents"
  | "users";

const SECTION_CONFIG: Record<AdminSection, { label: string; accent: string }> = {
  "risk-signals":     { label: "Risk Signals",     accent: "border-red-400" },
  "solution-signals": { label: "Solution Signals",  accent: "border-green-400" },
  "discovery":        { label: "Discovery",          accent: "border-purple-400" },
  "scoring":          { label: "Scoring",            accent: "border-amber-400" },
  "editorial":        { label: "Editorial",          accent: "border-cyan-400" },
  "agents":           { label: "Agents",             accent: "border-blue-400" },
  "users":            { label: "Users",              accent: "border-emerald-400" },
};

const ALL_SECTIONS: AdminSection[] = [
  "risk-signals",
  "solution-signals",
  "discovery",
  "scoring",
  "editorial",
  "agents",
  "users",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Admin() {
  const { user, userDoc, logOut } = useAuth();
  const navigate = useNavigate();

  // RBAC
  const userRoles: UserRole[] = userDoc?.roles ?? [];
  const visibleSections = ALL_SECTIONS.filter((s) => canAccessTab(userRoles, s));
  const [section, setSection] = useState<AdminSection>(visibleSections[0] ?? "risk-signals");

  // Acknowledgment gate
  const [acknowledged, setAcknowledged] = useState(
    () => !!(userDoc as Record<string, unknown> | null)?.acknowledgedAt,
  );

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {!acknowledged && (
        <AcknowledgmentModal onComplete={() => setAcknowledged(true)} />
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-gray-400 hover:text-white transition-colors shrink-0"
          >
            &larr; Home
          </button>
          <h1 className="text-lg font-bold shrink-0">Admin</h1>
          <PipelineHealth />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/help")}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Help
          </button>
          <span className="text-xs text-gray-500 truncate">{user?.email}</span>
          <button
            onClick={logOut}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Section navigation */}
      <div className="flex gap-4 px-4 border-b border-white/10 overflow-x-auto md:gap-6 md:px-6">
        {visibleSections.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`py-3 text-sm transition-colors border-b-2 whitespace-nowrap ${
              section === s
                ? `${SECTION_CONFIG[s].accent} text-white`
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {SECTION_CONFIG[s].label}
          </button>
        ))}
        <button
          onClick={() => navigate("/observatory")}
          className="py-3 text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-300 whitespace-nowrap"
        >
          Observatory
        </button>
      </div>

      {/* Section content — each tab is fully self-contained */}
      {section === "risk-signals" && <RiskSignalsTab />}
      {section === "solution-signals" && <SolutionSignalsTab />}
      {section === "discovery" && <NewDiscoveryTab />}
      {section === "scoring" && <ScoringTab />}
      {section === "editorial" && <EditorialReviewTab />}
      {section === "agents" && (
        <div className="p-4 md:p-6">
          <AgentsSection />
        </div>
      )}
      {section === "users" && <UsersTab />}
    </div>
  );
}
