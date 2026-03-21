export type ReviewItemType = "signal" | "discovery" | "validation";

export interface ReviewItem {
  id: string;
  type: ReviewItemType;
  title: string;
  summary: string;
  status: string;
  createdAt: { seconds: number } | null;
  /** Signal-specific */
  signalType?: string;
  riskCategories?: string[];
  solutionIds?: string[];
  severityHint?: string;
  confidenceScore?: number;
  sourceName?: string;
  sourceUrl?: string;
  relatedNodeIds?: string[];
  /** Discovery-specific */
  proposedName?: string;
  proposalType?: string;
  skeleton?: Record<string, unknown>;
  supportingSignalIds?: string[];
  /** Validation-specific */
  documentType?: string;
  documentId?: string;
  documentName?: string;
  proposedChanges?: Record<string, { current_value: unknown; proposed_value: unknown }>;
  overallReasoning?: string;
  confidence?: number;
}

interface Props {
  item: ReviewItem;
  selected: boolean;
  onClick: () => void;
}

export function ReviewItemCard({ item, selected, onClick }: Props) {
  const typeColors: Record<ReviewItemType, string> = {
    signal: "border-blue-500",
    discovery: "border-purple-500",
    validation: "border-amber-500",
  };

  const typeLabels: Record<ReviewItemType, string> = {
    signal: "Signal",
    discovery: "Discovery",
    validation: "Validation",
  };

  const borderColor = typeColors[item.type];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-l-4 ${borderColor} rounded-r-lg transition-colors ${
        selected
          ? "bg-white/10 ring-1 ring-white/20"
          : "bg-white/5 hover:bg-white/8"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          {typeLabels[item.type]}
        </span>
        {item.status === "pending" && (
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
        )}
      </div>
      <h4 className="text-sm font-medium text-white/90 line-clamp-2">
        {item.title || item.proposedName || item.documentName || "Untitled"}
      </h4>
      <p className="text-xs text-white/50 mt-1 line-clamp-1">
        {item.sourceName || item.proposalType || item.documentType || ""}
      </p>
    </button>
  );
}
