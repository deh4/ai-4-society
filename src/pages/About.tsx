import { Helmet } from "react-helmet-async";
import Layout from "../components/shared/Layout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { motion } from "framer-motion";

const SOURCE_TIERS = [
  {
    tier: "T1 — Institutional",
    examples: "OECD AI Observatory, EU AI Office, Nature, Science",
    credibility: "0.85–0.95",
    desc: "Peer-reviewed research, official policy documents, international organizations",
  },
  {
    tier: "T2 — Quality Journalism",
    examples: "MIT Tech Review, Ars Technica, Wired, Reuters",
    credibility: "0.70–0.85",
    desc: "Established tech and science journalism with editorial standards",
  },
  {
    tier: "T3 — Tech / Community",
    examples: "TechCrunch, The Verge, Hacker News",
    credibility: "0.50–0.70",
    desc: "Industry news and community discussion platforms",
  },
  {
    tier: "T4 — Active Search",
    examples: "Google Custom Search, GDELT",
    credibility: "0.40–0.70",
    desc: "Programmatic search across the broader web for emerging topics",
  },
  {
    tier: "T5 — Newsletters",
    examples: "TLDR AI, Import AI, Last Week in AI",
    credibility: "0.60–0.75",
    desc: "Curated AI newsletters by domain experts",
  },
  {
    tier: "T6 — Safety Research",
    examples: "Alignment Forum, CAIS, AI Now Institute",
    credibility: "0.75–0.90",
    desc: "Dedicated AI safety and governance research organizations",
  },
  {
    tier: "T7 — Domain-Specific",
    examples: "IEEE Spectrum, Nature Machine Intelligence, The Guardian AI",
    credibility: "0.70–0.85",
    desc: "Specialized publications covering AI from specific domain perspectives",
  },
];

const OECD_PRINCIPLES = [
  { id: "P01", name: "Inclusive Growth", desc: "AI should benefit people and the planet, driving inclusive growth, sustainable development, and well-being." },
  { id: "P02", name: "Human-Centred Values", desc: "AI systems should respect the rule of law, human rights, democratic values, and diversity." },
  { id: "P03", name: "Transparency & Explainability", desc: "AI systems should be transparent and responsible disclosure should be ensured." },
  { id: "P04", name: "Robustness & Safety", desc: "AI systems should function robustly, safely, and securely throughout their lifecycle." },
  { id: "P05", name: "Accountability", desc: "Organizations developing AI should be accountable for their proper functioning." },
  { id: "P06", name: "Investing in R&D", desc: "Governments should invest in AI research and development to spur innovation." },
  { id: "P07", name: "Digital Ecosystem", desc: "Governments should foster a digital ecosystem for trustworthy AI." },
  { id: "P08", name: "Skills & Labour", desc: "Governments should enable people to develop skills for AI and support fair transitions." },
  { id: "P09", name: "International Cooperation", desc: "Governments should cooperate across borders to share information and foster interoperability." },
  { id: "P10", name: "Domestic Policy", desc: "Governments should adopt national AI policies and regulatory frameworks." },
];

const RELEASE_NOTES = [
  {
    version: "v0.6",
    date: "March 2026",
    title: "Polish & Observability",
    changes: [
      "Node labels on all graph nodes (risk, solution, milestone, stakeholder)",
      "Mobile bottom sheet for Observatory detail panel",
      "7 new signal sources added (Alignment Forum, CAIS, Nature Machine Intelligence, IEEE Spectrum, The Guardian AI, AI Now, Ben's Bites)",
      "Admin source config grouped by tier with toggle fixes",
      "Feed Curator and Data Lifecycle run summaries now visible in admin",
      "README and design spec updated to reflect v2 state",
    ],
  },
  {
    version: "v0.5",
    date: "February–March 2026",
    title: "Admin Panel",
    changes: [
      "Agent dashboard with health cards, run history charts, and manual triggers",
      "Source config table with per-source enable/disable toggles",
      "Unified review list with bulk approve/reject",
      "User management for role assignment",
      "Paused-state checks for all scheduled agents",
    ],
  },
  {
    version: "v0.4",
    date: "February 2026",
    title: "Landing Page",
    changes: [
      "Instagram-style Risk Reels with gradient velocity rings",
      "Personalised news feed with recency-decay scoring",
      "Preference picker with interest tracking",
      "Hamburger nav for mobile",
    ],
  },
  {
    version: "v0.3",
    date: "February 2026",
    title: "Observatory",
    changes: [
      "Interactive force-directed graph (react-force-graph-2d)",
      "Node type filter (risk, solution, stakeholder, milestone)",
      "Detail panel with narrative, voting, evidence list, and connections",
      "Chronological timeline view",
      "Deep-link routing: /observatory/:nodeId",
    ],
  },
  {
    version: "v0.2",
    date: "January–February 2026",
    title: "Agent Pipeline",
    changes: [
      "Signal Scout: 17 RSS/API sources + Gemini 2.5 Flash classification",
      "Discovery Agent: clusters unmatched signals into new node proposals",
      "Validator Agent: proposes score and field updates for existing nodes",
      "Feed Curator: rebuilds ranked feed_items every 6 hours",
      "Data Lifecycle: archives and purges stale data daily",
      "Graph Builder: rebuilds graph_snapshot and node summaries on demand",
    ],
  },
  {
    version: "v0.1",
    date: "January 2026",
    title: "Foundation",
    changes: [
      "React 19 + Vite 7 + TypeScript + Tailwind 3.4 + Firebase",
      "Firebase Auth with Google OAuth and role-based access control",
      "Firestore graph model: nodes, edges, signals, graph_snapshot, feed_items",
      "GraphContext with real-time Firestore listeners",
      "Human-in-the-loop review gates (Gate 1: Signal Review, Gate 2: Proposal Review)",
    ],
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
      <Helmet>
        <title>About — AI 4 Society Observatory</title>
        <meta name="description" content="How the AI 4 Society Observatory works: our methodology, data sources, human review pipeline, and mission to track AI's impact on society." />
        <link rel="canonical" href="https://ai4society.io/about" />
        <meta property="og:url" content="https://ai4society.io/about" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="About — AI 4 Society Observatory" />
        <meta property="og:description" content="How the AI 4 Society Observatory works: our methodology, data sources, human review pipeline, and mission to track AI's impact on society." />
        <meta property="og:image" content="https://ai4society.io/og-image.png" />
        <meta property="og:site_name" content="AI 4 Society Observatory" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About — AI 4 Society Observatory" />
        <meta name="twitter:description" content="How the AI 4 Society Observatory works: our methodology, data sources, human review pipeline, and mission to track AI's impact on society." />
      </Helmet>
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

        {/* === Methodology === */}
        <Section title="Methodology" id="methodology">
          <p>
            The Observatory uses a multi-agent AI pipeline with mandatory human
            review gates. Every piece of information visible to the public has
            been approved by a human reviewer. Here is how the pipeline works
            end-to-end.
          </p>

          <h3 className="text-base font-semibold text-white mt-6 mb-2">Pipeline Overview</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 bg-white/5 rounded-lg p-3">
            <span className="shrink-0">Sources</span>
            <span>→</span>
            <span className="shrink-0">Signal Scout</span>
            <span>→</span>
            <span className="shrink-0 text-yellow-400">Gate 1</span>
            <span>→</span>
            <span className="shrink-0">Discovery Agent</span>
            <span>→</span>
            <span className="shrink-0 text-yellow-400">Gate 2</span>
            <span>→</span>
            <span className="shrink-0">Scoring Agent</span>
            <span>→</span>
            <span className="shrink-0 text-yellow-400">Gate 3</span>
            <span>→</span>
            <span className="shrink-0 text-[var(--accent-structural)]">Observatory</span>
          </div>

          <h3 className="text-base font-semibold text-white mt-6 mb-2">Agent Pipeline</h3>
          <div className="space-y-3 mt-3">
            {[
              {
                name: "Signal Scout",
                schedule: "Every 6 hours",
                desc: "Scans 41 RSS feeds and news APIs. Each article passes through a cheap filter (source credibility, recency, deduplication, keyword relevance) before AI classification. Gemini 2.5 Flash classifies surviving articles against our risk/solution taxonomy, assigns confidence and impact scores, and tags OECD principles and harm status.",
              },
              {
                name: "Feed Curator",
                schedule: "Every 6 hours",
                desc: "Builds the public feed from approved signals using recency-decay scoring. Generates editorial hooks — one-sentence, jargon-free summaries for the landing page carousel. Manages a circular buffer of 15 editorial hooks maximum.",
              },
              {
                name: "Discovery Agent",
                schedule: "Biweekly",
                desc: "Analyzes unmatched signals from the past 6 months. Clusters them into new node proposals (requiring 5+ supporting signals) and edge proposals (3+ signals). Each proposal includes a full node skeleton: name, description, key themes, scores, and principles.",
              },
              {
                name: "Scoring Agent",
                schedule: "Monthly (1st)",
                desc: "Batched assessment of all existing nodes. Proposes score updates, narrative changes, and velocity adjustments based on recent signal evidence. Evaluates no-signal relevance decay for nodes that haven't received new evidence.",
              },
              {
                name: "Graph Builder",
                schedule: "On demand",
                desc: "Rebuilds the denormalized graph snapshot and per-node trending summaries after any approval. The snapshot powers the Observatory visualization.",
              },
              {
                name: "Data Lifecycle",
                schedule: "Daily 03:00 UTC",
                desc: "Archives approved signals after 90 days, deletes rejected signals after 30 days, purges archived data after 1 year. Cleans orphaned documents and maintains collection health.",
              },
            ].map((agent) => (
              <div key={agent.name} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold text-white">{agent.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{agent.schedule}</span>
                </div>
                <p className="text-xs text-gray-400">{agent.desc}</p>
              </div>
            ))}
          </div>

          <h3 className="text-base font-semibold text-white mt-6 mb-2">Human Review Gates</h3>
          <p>
            Nothing reaches the public without passing through a human review
            gate. Each gate has dedicated reviewer roles with appropriate
            permissions:
          </p>
          <div className="space-y-3 mt-3">
            {[
              {
                gate: "Gate 1 — Signal Review",
                role: "Signal Reviewer",
                desc: "Every classified signal is reviewed before it enters the public feed or becomes evidence for the knowledge graph. Reviewers verify relevance, correct classification, and appropriate categorization. Signals can be approved, rejected, or edited.",
              },
              {
                gate: "Gate 2 — Discovery Review",
                role: "Discovery Reviewer",
                desc: "New node and edge proposals from the Discovery Agent are reviewed before being added to the knowledge graph. Reviewers assess whether proposed topics are genuinely novel, correctly scoped, and supported by sufficient signal evidence.",
              },
              {
                gate: "Gate 3 — Scoring Review",
                role: "Scoring Reviewer",
                desc: "Proposed score changes, narrative updates, and field modifications from the Scoring Agent are reviewed before applying. Reviewers verify that changes are justified by the evidence and maintain consistency across the graph.",
              },
            ].map((gate) => (
              <div key={gate.gate} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold text-yellow-400">{gate.gate}</span>
                  <span className="text-[10px] text-gray-500">{gate.role}</span>
                </div>
                <p className="text-xs text-gray-400">{gate.desc}</p>
              </div>
            ))}
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
        <Section title="Source Tiers" id="sources">
          <p>
            We scan 41 sources across seven tiers. Each tier is assigned a
            credibility range that directly affects how signals are ranked.
            Diverse sourcing helps counter individual source biases.
          </p>
          <div className="mt-3 space-y-2">
            {SOURCE_TIERS.map((tier) => (
              <div
                key={tier.tier}
                className="bg-white/5 rounded-lg p-3"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold text-white">{tier.tier}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{tier.credibility}</span>
                </div>
                <p className="text-[10px] text-gray-500 mb-1">{tier.desc}</p>
                <p className="text-[10px] text-gray-400">{tier.examples}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Credibility scores are configurable per source and reviewed regularly
            by the admin team.
          </p>
        </Section>

        {/* === OECD Principles === */}
        <Section title="OECD AI Principles" id="principles">
          <p>
            Every signal classified by our pipeline is tagged with one or more
            OECD AI Principles (P01–P10). These principles, adopted by 46
            countries, provide a standardized framework for evaluating AI's
            societal impact. We use them as the backbone of our classification
            taxonomy.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            {OECD_PRINCIPLES.map((p) => (
              <div key={p.id} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[10px] font-mono text-cyan-400">{p.id}</span>
                  <span className="text-xs font-semibold text-white">{p.name}</span>
                </div>
                <p className="text-[10px] text-gray-400">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Signals may also carry a <strong>harm status</strong> tag — either
            "incident" (harm has occurred) or "hazard" (potential for harm). This
            distinguishes between realized and potential risks in our analysis.
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

        {/* === Release Notes === */}
        <Section id="release-notes" title="Release Notes">
          <p className="text-sm text-gray-400 mb-6">
            A record of what's been built and shipped.
          </p>
          <div className="space-y-6">
            {RELEASE_NOTES.map((release) => (
              <div key={release.version} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-mono text-[var(--accent-structural)] bg-[var(--accent-structural)]/10 px-2 py-0.5 rounded whitespace-nowrap">
                    {release.version}
                  </span>
                  <div className="flex-1 w-px bg-white/10 mt-2" />
                </div>
                <div className="pb-6 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-semibold">{release.title}</span>
                    <span className="text-xs text-gray-500">{release.date}</span>
                  </div>
                  <ul className="space-y-1">
                    {release.changes.map((change, i) => (
                      <li key={i} className="text-xs text-gray-400 flex gap-2">
                        <span className="text-gray-600 mt-0.5 shrink-0">–</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </Layout>
  );
}
