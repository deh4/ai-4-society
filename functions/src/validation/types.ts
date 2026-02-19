export interface ValidationIssue {
  rule: string;
  severity: "critical" | "warning";
  message: string;
  field: string;
}

export interface ValidationResult {
  docId: string;
  collection: string;
  issues: ValidationIssue[];
  hasCritical: boolean;
}

export interface CollectionStats {
  scanned: number;
  passed: number;
  rejected: number;
  flagged: number;
}

export interface TopicStats {
  scanned: number;
  flagged: number;
}

export interface UrlCheckStats {
  total: number;
  reachable: number;
  unreachable: number;
  timeouts: number;
}
