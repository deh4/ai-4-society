import type { ValidationIssue } from "./types.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_STAGES = ["Research", "Policy Debate", "Pilot Programs", "Early Adoption", "Scaling", "Mainstream"];

export function validateSolutionUpdate(
  data: Record<string, unknown>,
  approvedRiskUpdateIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const proposed = data.proposedChanges as Record<string, unknown> | undefined;
  const current = data.currentValues as Record<string, unknown> | undefined;

  // Critical: parentRiskId valid
  if (!VALID_RISK_IDS.has(data.parentRiskId as string)) {
    issues.push({ rule: "parent-risk-valid", severity: "critical", message: `Invalid parentRiskId: ${data.parentRiskId}`, field: "parentRiskId" });
  }

  // Critical: scores in range
  if (proposed) {
    for (const field of ["adoption_score_2026", "adoption_score_2035"]) {
      const val = proposed[field];
      if (typeof val === "number" && (val < 0 || val > 100)) {
        issues.push({ rule: "scores-in-range", severity: "critical", message: `${field} out of range [0,100]: ${val}`, field: `proposedChanges.${field}` });
      }
    }
  }

  // Critical: stage enum
  const stage = proposed?.implementation_stage as string | undefined;
  if (stage && !VALID_STAGES.includes(stage)) {
    issues.push({ rule: "stage-enum", severity: "critical", message: `Invalid implementation_stage: ${stage}`, field: "proposedChanges.implementation_stage" });
  }

  // Critical: delta consistency
  if (proposed && current && typeof data.scoreDelta === "number") {
    const expected = Math.abs((proposed.adoption_score_2026 as number) - (current.adoption_score_2026 as number));
    if (Math.abs(data.scoreDelta as number - expected) > 0.01) {
      issues.push({ rule: "delta-consistency", severity: "critical", message: `scoreDelta ${data.scoreDelta} != expected ${expected.toFixed(2)}`, field: "scoreDelta" });
    }
  }

  // Critical: stageChanged consistency
  if (proposed && current && typeof data.stageChanged === "boolean") {
    const expected = proposed.implementation_stage !== current.implementation_stage;
    if (data.stageChanged !== expected) {
      issues.push({ rule: "stage-consistency", severity: "critical", message: `stageChanged is ${data.stageChanged}, expected ${expected}`, field: "stageChanged" });
    }
  }

  // Critical: escalation consistency
  if (typeof data.scoreDelta === "number" && typeof data.stageChanged === "boolean" && typeof data.requiresEscalation === "boolean") {
    const expected = (data.scoreDelta as number) >= 10 || (data.stageChanged as boolean);
    if (data.requiresEscalation !== expected) {
      issues.push({ rule: "escalation-consistency", severity: "critical", message: `requiresEscalation is ${data.requiresEscalation}, expected ${expected}`, field: "requiresEscalation" });
    }
  }

  // Warning: narrative complete
  const narrative = proposed?.timeline_narrative as Record<string, unknown> | undefined;
  if (narrative) {
    for (const field of ["near_term", "mid_term", "long_term"]) {
      if (!narrative[field] || typeof narrative[field] !== "string" || (narrative[field] as string).trim() === "") {
        issues.push({ rule: "narrative-complete", severity: "warning", message: `timeline_narrative.${field} is empty`, field: `proposedChanges.timeline_narrative.${field}` });
      }
    }
  }

  // Warning: risk update refs exist
  const riskUpdateIds = data.riskUpdateIds;
  if (Array.isArray(riskUpdateIds)) {
    for (const id of riskUpdateIds) {
      if (!approvedRiskUpdateIds.has(id as string)) {
        issues.push({ rule: "risk-update-refs-exist", severity: "warning", message: `risk_update ${id} not found or not approved`, field: "riskUpdateIds" });
      }
    }
  }

  // Warning: confidence range
  if (typeof data.confidence === "number" && (data.confidence < 0 || data.confidence > 1)) {
    issues.push({ rule: "confidence-range", severity: "warning", message: `confidence out of range: ${data.confidence}`, field: "confidence" });
  }

  // Warning: stage skip
  if (stage && current?.implementation_stage) {
    const currentIdx = VALID_STAGES.indexOf(current.implementation_stage as string);
    const proposedIdx = VALID_STAGES.indexOf(stage);
    if (currentIdx >= 0 && proposedIdx >= 0 && Math.abs(proposedIdx - currentIdx) > 1) {
      issues.push({ rule: "stage-skip", severity: "warning", message: `Stage jumped from "${current.implementation_stage}" to "${stage}" (skipped ${Math.abs(proposedIdx - currentIdx) - 1} stages)`, field: "proposedChanges.implementation_stage" });
    }
  }

  return issues;
}
