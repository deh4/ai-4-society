export interface ChangelogChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ChangelogDoc {
  documentType: "risk" | "solution";
  documentId: string;
  version: number;
  changes: ChangelogChange[];
  updateId: string;
  reviewedBy: string;
  reviewedAt: FirebaseFirestore.Timestamp;
  createdBy: string;
  reasoning: string;
  confidence: number;
  createdAt: FirebaseFirestore.FieldValue;
}

export interface ChangelogStats {
  riskChangelogsWritten: number;
  solutionChangelogsWritten: number;
  skippedNoChanges: number;
}

export interface NarrativeStats {
  risksRefreshed: number;
  solutionsRefreshed: number;
  skippedInsignificant: number;
  geminiCalls: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface NarrativeRiskResult {
  summary: string;
  deep_dive: string;
  who_affected: string[];
}

export interface NarrativeSolutionResult {
  summary: string;
  deep_dive: string;
}
