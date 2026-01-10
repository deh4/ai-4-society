# Agentic Framework Architecture
## AI 4 Society Observatory - Autonomous Data Management System

**Version:** 1.0  
**Date:** January 10, 2026  
**Status:** Design Proposal

---

## 1. Executive Summary

This document outlines a multi-agent architecture designed to autonomously populate, update, and maintain the AI 4 Society Observatory's backend data. The system consists of specialized agents that collaborate through a hierarchical orchestration pattern, ensuring data quality, consistency, and real-world relevance.

### Key Objectives
- **Autonomous Data Population:** Continuously monitor and capture relevant AI risk and solution data
- **Real-time Updates:** Keep risk scores, narratives, and signal evidence current
- **Quality Assurance:** Validate data accuracy through multi-agent verification
- **Relationship Management:** Maintain and discover connections between risks and solutions
- **Human Oversight:** Enable review and correction while maintaining automation

---

## 2. Current Data Model Analysis

### Collections
1. **Risks Collection**
   - Core fields: `risk_name`, `category`, `score_2026`, `score_2035`, `connected_to`, `velocity`
   - Rich content: `summary`, `deep_dive`, `who_affected`, `timeline_narrative`, `mitigation_strategies`
   - Evidence: `signal_evidence` (date, headline, source, url)
   - Perception: `expert_severity`, `public_perception`

2. **Solutions Collection**
   - Core fields: `parent_risk_id`, `solution_title`, `solution_type`, `implementation_stage`
   - Scores: `adoption_score_2026`, `adoption_score_2035`
   - Metadata: `key_players`, `barriers`, `timeline_narrative`

### Data Update Requirements
- **High-frequency:** Signal evidence, scores (weekly/daily)
- **Medium-frequency:** Narratives, perception metrics (monthly)
- **Low-frequency:** Core definitions, relationships (quarterly)

---

## 3. Agentic Framework Architecture

### 3.1 Agent Hierarchy

```
                    ┌─────────────────────────┐
                    │   Orchestrator Agent    │
                    │  (Coordination Layer)   │
                    └───────────┬─────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐  ┌────▼─────┐  ┌─────▼──────┐
        │   Research   │  │ Analysis │  │   Quality  │
        │    Layer     │  │  Layer   │  │   Layer    │
        └───────┬──────┘  └────┬─────┘  └─────┬──────┘
                │               │               │
    ┌───────────┼───────┐      │       ┌───────┼───────┐
    │           │       │      │       │       │       │
┌───▼───┐  ┌───▼───┐ ┌─▼──┐ ┌─▼──┐  ┌─▼──┐ ┌──▼──┐ ┌─▼──┐
│Signal │  │Topic  │ │Risk│ │Sol │  │Val │ │Cons │ │Human│
│Scout  │  │Tracker│ │Eval│ │Eval│  │idtr│ │olidtr│ │Loop│
└───────┘  └───────┘ └────┘ └────┘  └────┘ └─────┘ └────┘
```

### 3.2 Agent Types & Responsibilities

#### **Tier 1: Orchestrator Agent**
**Role:** Master coordinator and decision-maker

**Responsibilities:**
- Schedule and trigger subordinate agents based on priority
- Manage workflow state and task queues
- Handle conflict resolution between agents
- Interface with human oversight dashboard
- Maintain system health and performance metrics

**Key Capabilities:**
- Multi-agent task scheduling
- Priority-based resource allocation
- Deadlock detection and resolution
- Audit trail maintenance

**Technology Stack:**
- LangGraph for workflow orchestration
- Firebase Functions for serverless execution
- Cloud Tasks for job scheduling
- Firestore for state management

---

#### **Tier 2A: Research Layer**

##### **Signal Scout Agent**
**Role:** Discover and collect real-world evidence

**Responsibilities:**
- Monitor news sources, research papers, regulatory filings
- Detect relevant AI-related incidents and developments
- Extract structured signal evidence from unstructured content
- Categorize signals by risk/solution relevance

**Data Sources:**
- News APIs (NewsAPI, GDELT, Common Crawl News)
- Academic databases (arXiv, Google Scholar)
- Social media trends (Twitter/X, Reddit, HackerNews)
- Government/regulatory sites (EU AI Act, SEC filings)

**Output:**
```json
{
  "signal_id": "SIG_2026_01_001",
  "headline": "Major deepfake fraud case...",
  "source": "Financial Times",
  "url": "https://...",
  "date": "2026-01-10",
  "relevance_scores": {
    "R01": 0.92,
    "R05": 0.45
  },
  "confidence": 0.87,
  "entities_mentioned": ["banks", "AI", "fraud"],
  "sentiment": "negative"
}
```

**Update Frequency:** Continuous (every 4-6 hours)

---

##### **Topic Tracker Agent**
**Role:** Monitor specific AI domains and emerging themes

**Responsibilities:**
- Track evolution of known risks (deepfakes, model collapse, etc.)
- Identify emerging risk patterns not yet in database
- Monitor solution adoption progress
- Detect shifts in public/expert sentiment

**Data Sources:**
- Specialized AI safety forums
- Industry reports (Gartner, McKinsey)
- Policy think tanks (CSET, FLI)
- Technical communities (ML subreddits, AI Discord servers)

**Output:**
```json
{
  "topic_id": "TOPIC_QUANTUM_AI_SECURITY",
  "status": "emerging",
  "first_detected": "2026-01-01",
  "signal_count": 12,
  "growth_velocity": "high",
  "suggested_risk_category": "Security",
  "preliminary_narrative": "Quantum computing advances threaten current cryptographic standards...",
  "related_existing_risks": ["R01"]
}
```

**Update Frequency:** Daily

---

#### **Tier 2B: Analysis Layer**

##### **Risk Evaluation Agent**
**Role:** Assess and update risk metrics

**Responsibilities:**
- Calculate risk scores based on incoming signals
- Generate/update narrative content (summary, deep_dive)
- Identify affected stakeholders
- Project timeline evolution
- Determine risk velocity (Critical/High/Medium/Low)

**Methodology:**
- Weighted scoring algorithm combining:
  - Signal frequency (20%)
  - Signal severity (30%)
  - Expert consensus (25%)
  - Public awareness gap (15%)
  - Trend velocity (10%)

**Output:**
```json
{
  "risk_id": "R01",
  "updated_fields": {
    "score_2026": 9.7,
    "score_2035": 3.8,
    "velocity": "Critical",
    "summary": "[Updated narrative]",
    "signal_evidence": ["SIG_001", "SIG_045"],
    "expert_severity": 9.5,
    "public_perception": 6.5
  },
  "confidence": 0.89,
  "reasoning": "Score increased due to 3 high-severity incidents in past week...",
  "approval_required": false
}
```

**Update Frequency:** Weekly (or triggered by high-severity signals)

---

##### **Solution Evaluation Agent**
**Role:** Track solution development and adoption

**Responsibilities:**
- Monitor solution implementation progress
- Update adoption scores and stages
- Identify new barriers or enablers
- Track key player involvement
- Generate adoption timelines

**Data Sources:**
- Company announcements
- GitHub/open-source activity
- Patent filings
- Pilot program reports
- Regulatory developments

**Output:**
```json
{
  "solution_id": "S01",
  "updated_fields": {
    "implementation_stage": "Early Adoption",
    "adoption_score_2026": 3.2,
    "adoption_score_2035": 8.1,
    "key_players": ["EU Digital ID", "Apple", "World ID", "Mastercard"],
    "barriers": ["Privacy concerns", "Regulatory fragmentation"],
    "timeline_narrative": {
      "near_term": "[Updated based on EU pilot results]"
    }
  },
  "confidence": 0.82,
  "reasoning": "Mastercard announced pilot program, EU increased funding..."
}
```

**Update Frequency:** Bi-weekly

---

#### **Tier 2C: Quality Layer**

##### **Validation Agent**
**Role:** Ensure data quality and accuracy

**Responsibilities:**
- Fact-check signal evidence URLs and sources
- Verify narrative consistency with sources
- Check for hallucinations or unsupported claims
- Validate score calculations
- Detect anomalies and outliers

**Quality Checks:**
1. **Source Verification:** URL accessibility, domain reputation
2. **Cross-reference:** Multiple sources for major claims
3. **Temporal Consistency:** No anachronistic references
4. **Quantitative Bounds:** Scores within 0-10 range
5. **Relationship Integrity:** `connected_to` IDs exist

**Output:**
```json
{
  "validation_id": "VAL_2026_01_001",
  "target": "R01_update_2026_01_10",
  "status": "approved" | "rejected" | "flagged_for_review",
  "issues_found": [
    {
      "field": "signal_evidence[0].url",
      "issue": "404 not found",
      "severity": "high"
    }
  ],
  "confidence_adjustment": -0.05,
  "recommendation": "Remove broken link, reduce confidence to 0.84"
}
```

**Update Frequency:** Triggered after each Research/Analysis agent update

---

##### **Consolidation Agent**
**Role:** Merge updates and maintain database consistency

**Responsibilities:**
- Aggregate updates from multiple agents
- Resolve conflicts (e.g., two agents suggest different scores)
- Maintain data versioning and history
- Execute atomic database writes
- Generate change logs for human review

**Conflict Resolution Strategy:**
1. **Confidence-weighted averaging** for quantitative fields
2. **Recency preference** for rapidly evolving data
3. **Source authority ranking** for conflicting narratives
4. **Human escalation** for major discrepancies (>2 point score difference)

**Output:**
```json
{
  "consolidation_id": "CONS_2026_01_10_R01",
  "target_document": "risks/R01",
  "merged_updates": {
    "score_2026": 9.6,
    "signal_evidence": ["SIG_001", "SIG_045", "SIG_072"]
  },
  "conflicts_resolved": [
    {
      "field": "score_2026",
      "inputs": [9.7, 9.5],
      "resolution": 9.6,
      "method": "confidence_weighted_average"
    }
  ],
  "applied_at": "2026-01-10T14:30:00Z",
  "changelog": "Added 2 new signals, increased score by 0.3"
}
```

**Update Frequency:** Triggered after validation, batch writes every 6 hours

---

##### **Human-in-the-Loop Agent**
**Role:** Facilitate human oversight and correction

**Responsibilities:**
- Surface high-impact changes for review
- Present flagged items in dashboard
- Apply human corrections to agent models
- Collect feedback for agent tuning
- Manage approval workflows

**Escalation Criteria:**
- Score changes > 2 points
- New risk/solution creation
- Validation failures > 2 for same item
- Low confidence updates (< 0.5)
- Contradictory signals

**Interface:**
- Web dashboard showing pending approvals
- Email/Slack notifications for urgent items
- Feedback forms for correction
- Bulk approval for routine updates

---

## 4. Agent Cooperation Patterns

### 4.1 Workflow: New Signal Processing

```
1. Signal Scout → Discovers new article about deepfake fraud
   ↓
2. Signal Scout → Extracts structured data, assigns relevance scores
   ↓
3. Orchestrator → Routes signal to Risk Evaluation Agent
   ↓
4. Risk Evaluation → Recalculates R01 score, updates narrative
   ↓
5. Validation Agent → Verifies source URL, checks narrative consistency
   ↓
   ├─ If valid → 6. Consolidation Agent → Merges with other updates
   └─ If invalid → Human Loop → Flag for review
   ↓
7. Consolidation Agent → Writes to Firestore (risks/R01)
   ↓
8. Orchestrator → Logs success, updates metrics
```

### 4.2 Workflow: New Risk Discovery

```
1. Topic Tracker → Detects emerging pattern (Quantum AI Security)
   ↓
2. Topic Tracker → Collects 20+ supporting signals
   ↓
3. Orchestrator → Triggers Risk Evaluation Agent in "creation mode"
   ↓
4. Risk Evaluation → Generates risk profile (R13: Quantum Cryptography Vulnerability)
   ↓
5. Validation Agent → Verifies novelty (not duplicate), checks sources
   ↓
6. Human Loop → MANDATORY REVIEW (new risk creation)
   ↓
   ├─ If approved → Consolidation → Creates risks/R13
   └─ If rejected → Archive suggestion, tune Topic Tracker
```

### 4.3 Communication Protocol

**Shared State (Firestore):**
- `/agent_tasks/{task_id}` - Task queue and status
- `/agent_outputs/{agent_id}/{output_id}` - Intermediate results
- `/agent_metrics/{agent_id}` - Performance and health
- `/conflicts/{conflict_id}` - Unresolved issues

**Message Bus (Pub/Sub):**
- `topic:new_signals` - Signal Scout publishes discoveries
- `topic:updates_pending` - Analysis agents publish proposed changes
- `topic:validation_required` - Triggers validation workflows
- `topic:human_review_needed` - Escalation notifications

### 4.4 Conflict Resolution

**Scenario 1: Score Disagreement**
- Risk Eval Agent A: score_2026 = 9.7 (confidence 0.85)
- Risk Eval Agent B: score_2026 = 9.3 (confidence 0.90)
- **Resolution:** Weighted average = (9.7×0.85 + 9.3×0.90)/(0.85+0.90) = 9.49 ≈ 9.5

**Scenario 2: Contradictory Narratives**
- Agent A: "Risk decreasing due to new regulations"
- Agent B: "Risk increasing due to new exploits"
- **Resolution:** Human escalation + source review

**Scenario 3: Relationship Discovery**
- Topic Tracker: R13 should connect to R01
- Risk Eval: R01 already connected to [R05, R09]
- **Resolution:** Validation checks if connection is bidirectional and semantically valid

---

## 5. Data Consolidation Strategy

### 5.1 Update Pipeline

```
┌─────────────┐
│ Raw Updates │ (Multiple agents propose changes)
└──────┬──────┘
       │
┌──────▼──────┐
│ Validation  │ (Quality checks, anomaly detection)
└──────┬──────┘
       │
┌──────▼──────┐
│Deduplication│ (Merge identical signals, remove duplicates)
└──────┬──────┘
       │
┌──────▼──────┐
│   Conflict  │ (Resolve scoring/narrative conflicts)
│ Resolution  │
└──────┬──────┘
       │
┌──────▼──────┐
│   Staging   │ (Preview changes, calculate diffs)
└──────┬──────┘
       │
       ├─── Low Impact ───→ Auto-approve ───┐
       │                                    │
       └─── High Impact ──→ Human Review ───┤
                                            │
                                    ┌───────▼───────┐
                                    │ Atomic Commit │
                                    │  (Firestore)  │
                                    └───────┬───────┘
                                            │
                                    ┌───────▼───────┐
                                    │  Changelog &  │
                                    │  Versioning   │
                                    └───────────────┘
```

### 5.2 Versioning & History

**Document Structure:**
```json
{
  "id": "R01",
  "current_version": 15,
  "data": { /* current risk data */ },
  "metadata": {
    "last_updated": "2026-01-10T14:30:00Z",
    "last_updated_by": "consolidation_agent",
    "confidence": 0.87,
    "human_verified": true,
    "human_verified_at": "2026-01-09T10:00:00Z"
  }
}
```

**Changelog Collection:**
```json
{
  "id": "changelog_R01_v15",
  "document_id": "R01",
  "version": 15,
  "timestamp": "2026-01-10T14:30:00Z",
  "changed_by": "consolidation_agent",
  "changes": [
    {
      "field": "score_2026",
      "old_value": 9.3,
      "new_value": 9.6,
      "reason": "3 new high-severity signals"
    }
  ],
  "contributing_agents": ["signal_scout", "risk_eval", "validation"]
}
```

### 5.3 Atomic Operations

**Transaction Pattern:**
```typescript
async function applyConsolidatedUpdate(update: ConsolidatedUpdate) {
  const batch = db.batch();
  
  // 1. Update main document
  const docRef = db.collection('risks').doc(update.riskId);
  batch.update(docRef, {
    ...update.data,
    'metadata.last_updated': serverTimestamp(),
    'metadata.confidence': update.confidence,
    'metadata.version': increment(1)
  });
  
  // 2. Create changelog entry
  const changelogRef = db.collection('changelogs').doc();
  batch.set(changelogRef, update.changelog);
  
  // 3. Update agent metrics
  const metricsRef = db.collection('agent_metrics').doc('consolidation_agent');
  batch.update(metricsRef, {
    'updates_applied': increment(1),
    'last_run': serverTimestamp()
  });
  
  // 4. Clear completed tasks
  for (const taskId of update.completedTasks) {
    batch.delete(db.collection('agent_tasks').doc(taskId));
  }
  
  await batch.commit();
}
```

---

## 6. Technical Implementation

### 6.1 Technology Stack

**Agent Runtime:**
- **Framework:** LangChain + LangGraph for agent orchestration
- **LLM:** GPT-4o / Claude 3.5 Sonnet for analysis agents
- **Embedding:** OpenAI text-embedding-3-large for semantic search
- **Vector Store:** Pinecone for signal similarity detection

**Infrastructure:**
- **Backend:** Firebase Cloud Functions (Node.js/TypeScript)
- **Database:** Firebase Firestore (existing)
- **Scheduling:** Google Cloud Tasks / Cloud Scheduler
- **Message Queue:** Google Cloud Pub/Sub
- **Monitoring:** Cloud Logging + Custom dashboard

**Data Sources:**
- **News:** NewsAPI, GDELT, Common Crawl
- **Academic:** arXiv API, Semantic Scholar
- **Social:** Reddit API, Twitter/X API
- **Regulatory:** Custom scrapers for EU/US gov sites

### 6.2 Agent Architecture (Code Structure)

```
/agents
  /orchestrator
    - workflow.ts          (LangGraph workflow definition)
    - scheduler.ts         (Task scheduling logic)
    - state-manager.ts     (Shared state management)
  
  /research
    /signal-scout
      - agent.ts           (Main agent logic)
      - sources.ts         (Data source connectors)
      - extraction.ts      (NLP extraction pipeline)
    /topic-tracker
      - agent.ts
      - trend-detection.ts
      - clustering.ts
  
  /analysis
    /risk-evaluation
      - agent.ts
      - scoring.ts         (Risk scoring algorithm)
      - narrative-gen.ts   (LLM-based narrative generation)
    /solution-evaluation
      - agent.ts
      - adoption-tracking.ts
  
  /quality
    /validation
      - agent.ts
      - fact-checker.ts    (URL validation, source verification)
      - consistency.ts     (Cross-reference checking)
    /consolidation
      - agent.ts
      - conflict-resolver.ts
      - merger.ts
    /human-loop
      - agent.ts
      - dashboard-api.ts   (REST API for admin UI)
      - notifications.ts
  
  /shared
    - types.ts             (Shared TypeScript interfaces)
    - prompts.ts           (LLM prompt templates)
    - utils.ts             (Common utilities)
    - firestore.ts         (Database helpers)
```

### 6.3 Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│              Google Cloud Platform                  │
│                                                     │
│  ┌──────────────┐         ┌──────────────┐        │
│  │ Cloud        │         │ Cloud        │        │
│  │ Scheduler    │────────▶│ Functions    │        │
│  │ (Cron Jobs)  │         │ (Agents)     │        │
│  └──────────────┘         └──────┬───────┘        │
│                                   │                 │
│  ┌──────────────┐         ┌──────▼───────┐        │
│  │ Cloud        │◀────────│ Pub/Sub      │        │
│  │ Tasks        │         │ (Messages)   │        │
│  └──────┬───────┘         └──────────────┘        │
│         │                                          │
│  ┌──────▼───────────────────────────────┐         │
│  │         Firestore Database           │         │
│  │  ┌──────┐ ┌──────┐ ┌──────┐         │         │
│  │  │Risks │ │Solns │ │Logs  │ ...     │         │
│  │  └──────┘ └──────┘ └──────┘         │         │
│  └──────────────────────────────────────┘         │
│                                                     │
└─────────────────────────────────────────────────────┘
           │                           │
           │ Writes                    │ Reads
           ▼                           ▼
┌──────────────────┐        ┌──────────────────┐
│  Admin Dashboard │        │  Public Frontend │
│  (Next.js)       │        │  (React/Vite)    │
└──────────────────┘        └──────────────────┘
```

---

## 7. Execution Schedule

### Initial Deployment (Week 1-2)
1. Deploy Orchestrator Agent (minimal viable version)
2. Deploy Signal Scout Agent (news sources only)
3. Deploy Validation Agent (basic checks)
4. Deploy Consolidation Agent
5. Set up Human-in-the-Loop dashboard

### Phase 2 (Week 3-4)
1. Add Topic Tracker Agent
2. Deploy Risk Evaluation Agent
3. Enhance Validation Agent (fact-checking)
4. Add more Signal Scout sources

### Phase 3 (Week 5-6)
1. Deploy Solution Evaluation Agent
2. Implement conflict resolution
3. Add advanced analytics to Orchestrator
4. Performance optimization

### Ongoing (Monthly)
- Monitor agent performance
- Tune confidence thresholds
- Add new data sources
- Refine prompts based on human feedback

---

## 8. Success Metrics

### Data Quality Metrics
- **Update Freshness:** % of risks updated within target frequency (target: >90%)
- **Source Verification Rate:** % of signals with verified sources (target: >95%)
- **Human Approval Rate:** % of auto-updates approved by humans (target: >85%)
- **Duplicate Detection:** % of duplicate signals caught (target: >98%)

### Agent Performance Metrics
- **Signal Discovery Rate:** New relevant signals per day (baseline: 10-20)
- **False Positive Rate:** Irrelevant signals flagged (target: <10%)
- **Narrative Coherence Score:** Human rating of generated text (target: >4/5)
- **Update Latency:** Time from signal to database update (target: <6 hours)

### System Health Metrics
- **Agent Uptime:** % time agents are operational (target: >99%)
- **Task Queue Depth:** Pending tasks (target: <50)
- **Conflict Rate:** Updates requiring human arbitration (target: <5%)
- **API Cost per Update:** Cloud/LLM costs (budget monitoring)

---

## 9. Risk Mitigation

### Technical Risks
| Risk | Mitigation |
|------|------------|
| LLM hallucinations | Multi-layer validation, fact-checking, human review for high-impact changes |
| API rate limits | Request throttling, caching, fallback to alternative sources |
| Data source unavailability | Multiple redundant sources per signal type, graceful degradation |
| Database write conflicts | Optimistic locking, transaction retries, eventual consistency model |

### Operational Risks
| Risk | Mitigation |
|------|------------|
| Agent drift (quality degradation) | Continuous monitoring, A/B testing of prompts, monthly audits |
| Cost overruns | Budget alerts, cost-per-update tracking, LLM call optimization |
| Data bias amplification | Diverse source selection, bias detection in narratives, regular audits |
| Security vulnerabilities | Secrets management, API key rotation, least-privilege IAM |

---

## 10. Future Enhancements

### Phase 4: Advanced Features (3-6 months)
1. **Predictive Risk Modeling:** ML models to forecast risk evolution
2. **Relationship Discovery:** Graph neural networks to auto-detect risk connections
3. **Multi-language Support:** Agents monitor non-English sources
4. **Sentiment Analysis:** Track public opinion shifts in real-time
5. **Expert Network Integration:** Automated outreach to domain experts for validation

### Phase 5: Ecosystem Integration (6-12 months)
1. **API for External Researchers:** Allow third-party contributions
2. **Federated Learning:** Collaborate with other observatories while preserving data privacy
3. **Policy Impact Tracking:** Monitor how observa insights influence actual policy
4. **Simulation Engine:** Model "what-if" scenarios for risk interventions

---

## 11. Open Questions for Review

1. **Update Frequency:** Are the proposed schedules (daily/weekly) appropriate for this use case?
2. **Human Oversight Balance:** What confidence threshold should trigger human review?
3. **Cost Budget:** What is the acceptable monthly cost for LLM/API calls?
4. **Data Sources:** Are there specific authoritative sources we must include?
5. **Agent Autonomy:** Should agents be able to create new risk categories automatically, or always require human approval?
6. **Notification Strategy:** How should urgent high-severity signals be communicated to stakeholders?

---

## Appendix A: Example Agent Prompts

### Risk Evaluation Agent Prompt
```
You are a Risk Evaluation Agent for the AI 4 Society Observatory.

TASK: Analyze the following signals and update the risk profile for "{risk_name}".

SIGNALS:
{signal_list}

CURRENT RISK DATA:
{current_risk_json}

INSTRUCTIONS:
1. Calculate an updated risk score (0-10) based on signal severity and frequency
2. Update the summary if new developments warrant it
3. Add new signal evidence to the list
4. Adjust expert_severity if new authoritative sources comment
5. Update public_perception based on media coverage volume/tone

SCORING CRITERIA:
- 0-3: Theoretical or low-probability risk
- 4-6: Emerging risk with some evidence
- 7-8: Active risk with multiple documented incidents
- 9-10: Critical risk with widespread impact

OUTPUT FORMAT (JSON):
{
  "score_2026": <number>,
  "summary": "<text>",
  "signal_evidence": [<array>],
  "expert_severity": <number>,
  "public_perception": <number>,
  "confidence": <0-1>,
  "reasoning": "<explanation>"
}
```

### Validation Agent Prompt
```
You are a Validation Agent ensuring data quality.

TASK: Verify the following risk update for accuracy and consistency.

PROPOSED UPDATE:
{update_json}

VALIDATION CHECKLIST:
1. Are all URLs accessible and from reputable sources?
2. Do the signal headlines match the content at the URLs?
3. Is the risk score justified by the evidence provided?
4. Are there any anachronistic or impossible claims?
5. Is the narrative consistent with the signals?
6. Are numerical values within valid ranges?

OUTPUT FORMAT (JSON):
{
  "status": "approved" | "rejected" | "flagged_for_review",
  "issues_found": [{"field": "", "issue": "", "severity": ""}],
  "confidence_adjustment": <number>,
  "recommendation": "<text>"
}
```

---

## Appendix B: Database Schema Extensions

### New Collections for Agent System

**agent_tasks**
```typescript
interface AgentTask {
  id: string;
  agent_type: string;
  task_type: string;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created_at: Timestamp;
  assigned_to: string | null;
  payload: any;
  result: any | null;
  error: string | null;
}
```

**agent_outputs**
```typescript
interface AgentOutput {
  id: string;
  agent_id: string;
  output_type: string;
  target_document: string;
  data: any;
  confidence: number;
  created_at: Timestamp;
  status: 'pending_validation' | 'validated' | 'consolidated' | 'rejected';
}
```

**changelogs**
```typescript
interface Changelog {
  id: string;
  document_type: 'risk' | 'solution';
  document_id: string;
  version: number;
  timestamp: Timestamp;
  changed_by: string;
  changes: Array<{
    field: string;
    old_value: any;
    new_value: any;
    reason: string;
  }>;
  contributing_agents: string[];
  human_verified: boolean;
}
```

**signal_evidence_raw**
```typescript
interface RawSignal {
  id: string;
  headline: string;
  source: string;
  url: string;
  content: string;
  published_date: Timestamp;
  discovered_at: Timestamp;
  relevance_scores: Record<string, number>; // risk_id -> score
  entities: string[];
  sentiment: number;
  processed: boolean;
}
```

---

**END OF DOCUMENT**
