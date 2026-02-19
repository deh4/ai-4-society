import type { ValidationIssue } from "./types.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_VELOCITY = new Set(["rising", "stable", "declining"]);

export function validateTopic(
  data: Record<string, unknown>,
  signalIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Warning: riskCategories valid
  const cats = data.riskCategories;
  if (Array.isArray(cats)) {
    for (const cat of cats) {
      if (!VALID_RISK_IDS.has(cat as string)) {
        issues.push({ rule: "risk-categories-valid", severity: "warning", message: `Invalid risk category: ${cat}`, field: "riskCategories" });
        break;
      }
    }
  }

  // Warning: velocity enum
  if (!VALID_VELOCITY.has(data.velocity as string)) {
    issues.push({ rule: "velocity-enum", severity: "warning", message: `Invalid velocity: ${data.velocity}`, field: "velocity" });
  }

  // Warning: signalCount matches signalIds length
  const sids = data.signalIds;
  if (Array.isArray(sids) && typeof data.signalCount === "number") {
    if (data.signalCount !== sids.length) {
      issues.push({ rule: "signal-count-match", severity: "warning", message: `signalCount ${data.signalCount} != signalIds.length ${sids.length}`, field: "signalCount" });
    }
  }

  // Warning: signal refs exist
  if (Array.isArray(sids)) {
    for (const id of sids) {
      if (!signalIds.has(id as string)) {
        issues.push({ rule: "signal-refs-exist", severity: "warning", message: `Signal ${id} not found`, field: "signalIds" });
        break; // One warning is enough
      }
    }
  }

  // Warning: min signals
  if (Array.isArray(sids) && sids.length < 2) {
    issues.push({ rule: "min-signals", severity: "warning", message: `Only ${sids.length} signals (minimum 2)`, field: "signalIds" });
  }

  return issues;
}
