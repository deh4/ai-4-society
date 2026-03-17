import Layout from "../components/shared/Layout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { motion } from "framer-motion";

const SOURCE_TIERS = [
  {
    tier: "T1 — Institutional",
    examples: "OECD AI Observatory, EU AI Office, Nature, Science",
    credibility: "0.85–0.95",
  },
  {
    tier: "T2 — Quality Journalism",
    examples: "MIT Tech Review, Ars Technica, Wired, Reuters",
    credibility: "0.70–0.85",
  },
  {
    tier: "T3 — Tech / Community",
    examples: "TechCrunch, The Verge, Hacker News",
    credibility: "0.50–0.70",
  },
  {
    tier: "T4 — Active Search",
    examples: "Google Custom Search, GDELT",
    credibility: "0.40–0.70",
  },
  {
    tier: "T5 — Newsletters",
    examples: "TLDR AI, Import AI, Last Week in AI",
    credibility: "0.60–0.75",
  },
];

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
      className="py-12 border-b border-white/5 last:border-b-0"
    >
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <div className="text-sm text-gray-300 leading-relaxed space-y-4">
        {children}
      </div>
    </motion.section>
  );
}

export default function About() {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Page header */}
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          What is AI 4 Society?
        </h1>
        <p className="text-gray-400 text-sm mb-8">
          An open intelligence platform tracking how artificial intelligence is
          reshaping society — powered by AI, guided by humans.
        </p>

        {/* === Mission === */}
        <Section title="Mission" id="mission">
          <p>
            Artificial intelligence is transforming every aspect of human
            society — from employment and education to governance and warfare —
            faster than any institution can track. Most people hear about AI
            through hype cycles or fear headlines, not through structured,
            evidence-based analysis.
          </p>
          <p>
            AI 4 Society exists to close that gap. We operate a real-time
            observatory that continuously scans hundreds of sources, classifies
            signals by risk category, and connects them to an evolving knowledge
            graph of risks, solutions, stakeholders, and milestones.
          </p>
          <p>
            Our goal is to democratize AI risk intelligence — making it
            accessible enough for the general public yet rigorous enough for
            researchers and journalists to cite.
          </p>
        </Section>

        {/* === How It Works === */}
        <Section title="How It Works" id="how-it-works">
          <p>
            Every 12 hours, our Signal Scout agent scans news sources, research
            papers, and policy documents for AI-related developments. Each
            article passes through a two-stage filter:
          </p>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li>
              <strong>Cheap filter</strong> — checks source credibility,
              recency, deduplication, and keyword relevance. Cuts irrelevant
              articles before any AI processing.
            </li>
            <li>
              <strong>AI classification</strong> — Gemini analyzes surviving
              articles, classifies them against our risk/solution taxonomy, and
              assigns confidence and impact scores.
            </li>
          </ol>
          <p>
            Every classified signal then enters human review. Our volunteer
            reviewers approve, reject, or edit each signal before it appears in
            the public observatory. Nothing reaches the public without a human
            check.
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-500 bg-white/5 rounded-lg p-3 mt-4">
            <span className="shrink-0">Sources</span>
            <span>→</span>
            <span className="shrink-0">Signal Scout</span>
            <span>→</span>
            <span className="shrink-0">Human Review</span>
            <span>→</span>
            <span className="shrink-0 text-[var(--accent-structural)]">
              Observatory
            </span>
          </div>
        </Section>

        {/* === What We Track === */}
        <Section title="What We Track" id="what-we-track">
          <p>
            Our knowledge graph organizes AI developments into four connected
            types:
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              {
                type: "Risks",
                color: "text-red-400 border-red-500/30",
                desc: "Societal threats from AI — bias, job displacement, surveillance, autonomous weapons",
              },
              {
                type: "Solutions",
                color: "text-green-400 border-green-500/30",
                desc: "Governance frameworks, technical safeguards, policy proposals, industry standards",
              },
              {
                type: "Stakeholders",
                color: "text-blue-400 border-blue-500/30",
                desc: "Groups affected by or shaping AI — workers, regulators, researchers, communities",
              },
              {
                type: "Milestones",
                color: "text-yellow-400 border-yellow-500/30",
                desc: "Key events — breakthroughs, regulations passed, incidents, deployments",
              },
            ].map((item) => (
              <div
                key={item.type}
                className={`border rounded-lg p-3 ${item.color}`}
              >
                <div className="font-semibold text-xs mb-1">{item.type}</div>
                <div className="text-[10px] text-gray-400">{item.desc}</div>
              </div>
            ))}
          </div>
          <p className="mt-3">
            These nodes are connected by typed edges — risks are linked to
            solutions that address them, stakeholders impacted by risks, and
            milestones that escalate or de-escalate threats. The graph evolves
            weekly as our Discovery Agent proposes new connections.
          </p>
        </Section>

        {/* === Our Sources === */}
        <Section title="Our Sources" id="sources">
          <p>
            We scan sources across five tiers, each assigned a credibility score
            that directly affects how signals are ranked:
          </p>
          <div className="mt-3 space-y-2">
            {SOURCE_TIERS.map((tier) => (
              <div
                key={tier.tier}
                className="flex items-start gap-3 text-xs bg-white/5 rounded p-2"
              >
                <span className="shrink-0 font-medium w-36">{tier.tier}</span>
                <span className="text-gray-400 flex-1">{tier.examples}</span>
                <span className="shrink-0 text-gray-500 font-mono">
                  {tier.credibility}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Source credibility scores are configurable and reviewed regularly.
            Diverse sourcing helps counter individual source biases.
          </p>
        </Section>

        {/* === Human-in-the-Loop === */}
        <Section title="Human-in-the-Loop" id="human-review">
          <p>
            AI is powerful at pattern detection but unreliable at judgment. Every
            signal classified by our AI agents passes through human review
            before reaching the public:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>
              <strong>Signal review</strong> — Volunteer reviewers verify that
              each classified signal is relevant and correctly categorized.
            </li>
            <li>
              <strong>Graph review</strong> — Admins approve or reject proposals
              to add new risks, solutions, or connections to the knowledge
              graph.
            </li>
            <li>
              <strong>Score validation</strong> — Proposed changes to risk
              scores and narratives are reviewed before applying.
            </li>
          </ul>
          <p>
            This human-in-the-loop approach ensures that our observatory is more
            than AI-generated noise — it is curated intelligence.
          </p>
        </Section>

        {/* === Get Involved === */}
        <Section title="Get Involved" id="get-involved">
          <p>AI 4 Society is a volunteer-driven project. Here is how to help:</p>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li>
              <strong>Browse and vote</strong> — Visit the{" "}
              <button
                onClick={() => navigate("/observatory")}
                className="text-[var(--accent-structural)] hover:underline"
              >
                Observatory
              </button>{" "}
              and upvote or downvote risks and solutions to shape community
              perception scores.
            </li>
            <li>
              <strong>Sign in</strong> —{" "}
              {user ? (
                <span className="text-green-400">
                  You are signed in. You can vote.
                </span>
              ) : (
                <button
                  onClick={signIn}
                  className="text-[var(--accent-structural)] hover:underline"
                >
                  Sign in with Google
                </button>
              )}{" "}
              to become a Member and unlock voting.
            </li>
            <li>
              <strong>Apply to review</strong> — Members can request reviewer
              access to help verify AI-classified signals.
            </li>
          </ol>
        </Section>

        {/* === Data & Privacy === */}
        <Section title="Data & Privacy" id="privacy">
          <p>
            We take data responsibility seriously:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>
              Approved signals are retained for 90 days, then archived. Archived
              signals are deleted after 1 year.
            </li>
            <li>Rejected signals are deleted within 30 days.</li>
            <li>
              Individual votes are private — only aggregate counts are shown
              publicly.
            </li>
            <li>
              We collect only what Google OAuth provides (name, email, photo). No
              tracking pixels, no analytics beyond basic Firebase usage.
            </li>
            <li>
              All source data is publicly available — we surface and classify it,
              we do not create it.
            </li>
          </ul>
        </Section>
      </div>
    </Layout>
  );
}
