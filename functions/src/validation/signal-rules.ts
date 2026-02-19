import type { ValidationIssue } from "./types.js";
import type { UrlCheckResult } from "./url-checker.js";

const VALID_RISK_IDS = new Set(["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10"]);
const VALID_SEVERITY = new Set(["Critical", "Emerging", "Horizon"]);

export function validateSignal(
  data: Record<string, unknown>,
  urlResult?: UrlCheckResult
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Critical: URL format
  const url = data.source_url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    issues.push({ rule: "url-format", severity: "critical", message: "source_url is not a valid https:// URL", field: "source_url" });
  }

  // Critical: URL reachable (if checked)
  if (urlResult && !urlResult.reachable) {
    const detail = urlResult.error === "timeout"
      ? "timed out after 5s"
      : `returned HTTP ${urlResult.status ?? urlResult.error}`;
    issues.push({ rule: "url-reachable", severity: "critical", message: `source_url ${detail}`, field: "source_url" });
  }

  // Critical: risk_categories valid
  const cats = data.risk_categories;
  if (!Array.isArray(cats) || cats.length === 0) {
    issues.push({ rule: "risk-categories-nonempty", severity: "critical", message: "risk_categories is empty or missing", field: "risk_categories" });
  } else {
    for (const cat of cats) {
      if (!VALID_RISK_IDS.has(cat as string)) {
        issues.push({ rule: "risk-categories-valid", severity: "critical", message: `Invalid risk category: ${cat}`, field: "risk_categories" });
        break;
      }
    }
  }

  // Critical: severity_hint enum
  if (!VALID_SEVERITY.has(data.severity_hint as string)) {
    issues.push({ rule: "severity-hint-enum", severity: "critical", message: `Invalid severity_hint: ${data.severity_hint}`, field: "severity_hint" });
  }

  // Critical: confidence_score range
  const conf = data.confidence_score;
  if (typeof conf !== "number" || conf < 0 || conf > 1) {
    issues.push({ rule: "confidence-range", severity: "critical", message: `confidence_score out of range: ${conf}`, field: "confidence_score" });
  }

  // Warning: date checks
  const dateStr = data.published_date;
  if (typeof dateStr === "string") {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      issues.push({ rule: "date-parseable", severity: "warning", message: "published_date is not a valid date", field: "published_date" });
    } else {
      const now = Date.now();
      if (parsed.getTime() > now + 86_400_000) {
        issues.push({ rule: "date-not-future", severity: "warning", message: "published_date is in the future", field: "published_date" });
      }
      if (parsed.getTime() < now - 180 * 86_400_000) {
        issues.push({ rule: "date-not-stale", severity: "warning", message: "published_date is older than 180 days", field: "published_date" });
      }
    }
  }

  // Warning: title and summary nonempty
  if (!data.title || typeof data.title !== "string" || (data.title as string).trim() === "") {
    issues.push({ rule: "title-nonempty", severity: "warning", message: "title is empty", field: "title" });
  }
  if (!data.summary || typeof data.summary !== "string" || (data.summary as string).trim() === "") {
    issues.push({ rule: "summary-nonempty", severity: "warning", message: "summary is empty", field: "summary" });
  }

  return issues;
}
