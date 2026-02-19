import type { ValidationIssue } from "./types.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_VELOCITY = new Set(["Critical", "High", "Medium", "Low"]);

export function validateRiskUpdate(
  data: Record<string, unknown>,
  signalIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const proposed = data.proposedChanges as Record<string, unknown> | undefined;
  const current = data.currentValues as Record<string, unknown> | undefined;

  // Critical: riskId valid
  if (!VALID_RISK_IDS.has(data.riskId as string)) {
    issues.push({ rule: "risk-id-valid", severity: "critical", message: `Invalid riskId: ${data.riskId}`, field: "riskId" });
  }

  // Critical: scores in range
  if (proposed) {
    for (const field of ["score_2026", "score_2035", "expert_severity", "public_perception"]) {
      const val = proposed[field];
      if (typeof val === "number" && (val < 0 || val > 100)) {
        issues.push({ rule: "scores-in-range", severity: "critical", message: `${field} out of range [0,100]: ${val}`, field: `proposedChanges.${field}` });
      }
    }
  }

  // Critical: velocity enum
  if (proposed && !VALID_VELOCITY.has(proposed.velocity as string)) {
    issues.push({ rule: "velocity-enum", severity: "critical", message: `Invalid velocity: ${proposed?.velocity}`, field: "proposedChanges.velocity" });
  }

  // Critical: delta consistency
  if (proposed && current && typeof data.scoreDelta === "number") {
    const expected = Math.abs((proposed.score_2026 as number) - (current.score_2026 as number));
    if (Math.abs(data.scoreDelta as number - expected) > 0.01) {
      issues.push({ rule: "delta-consistency", severity: "critical", message: `scoreDelta ${data.scoreDelta} != expected ${expected.toFixed(2)}`, field: "scoreDelta" });
    }
  }

  // Critical: escalation consistency
  if (typeof data.scoreDelta === "number" && typeof data.requiresEscalation === "boolean") {
    const expected = (data.scoreDelta as number) >= 5;
    if (data.requiresEscalation !== expected) {
      issues.push({ rule: "escalation-consistency", severity: "critical", message: `requiresEscalation is ${data.requiresEscalation}, expected ${expected}`, field: "requiresEscalation" });
    }
  }

  // Warning: signal refs exist
  const evidence = data.newSignalEvidence;
  if (Array.isArray(evidence)) {
    for (const e of evidence) {
      const entry = e as Record<string, unknown>;
      if (entry.signalId && !signalIds.has(entry.signalId as string)) {
        issues.push({ rule: "signal-refs-exist", severity: "warning", message: `Signal ${entry.signalId} not found`, field: "newSignalEvidence" });
      }
    }
  }

  // Warning: reasoning nonempty
  if (typeof data.reasoning !== "string" || (data.reasoning as string).length < 20) {
    issues.push({ rule: "reasoning-nonempty", severity: "warning", message: "reasoning is too short (< 20 chars)", field: "reasoning" });
  }

  // Warning: confidence range
  if (typeof data.confidence === "number" && (data.confidence < 0 || data.confidence > 1)) {
    issues.push({ rule: "confidence-range", severity: "warning", message: `confidence out of range: ${data.confidence}`, field: "confidence" });
  }

  // Warning: score creep
  if (typeof data.scoreDelta === "number" && data.scoreDelta > 15) {
    issues.push({ rule: "score-creep", severity: "warning", message: `Large score jump: ${data.scoreDelta}`, field: "scoreDelta" });
  }

  return issues;
}
