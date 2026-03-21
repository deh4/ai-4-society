import { useState } from "react";

interface Props {
  date: string; // e.g. "2026-03-21"
  count: number;
  pendingCount: number;
  selectedCount: number;
  totalInGroup: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  children: React.ReactNode;
}

export function SignalDateGroup({
  date,
  count,
  pendingCount,
  selectedCount,
  totalInGroup,
  onSelectAll,
  onDeselectAll,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const formattedDate = formatRelativeDate(date);
  const allSelected = selectedCount === totalInGroup && totalInGroup > 0;

  return (
    <div className="mb-2">
      {/* Group header */}
      <div className="flex items-center gap-2 px-2 py-1.5 sticky top-0 z-10 bg-[var(--bg-primary)]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-white/40 hover:text-white/60 w-4"
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="text-xs font-medium text-white/70">{formattedDate}</span>
        <span className="text-[10px] text-white/40">{count} signals</span>
        {pendingCount > 0 && (
          <span className="text-[10px] bg-yellow-400/20 text-yellow-400 px-1.5 rounded-full">
            {pendingCount} pending
          </span>
        )}
        <div className="ml-auto">
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="text-[10px] text-white/40 hover:text-white/60"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
      </div>

      {/* Group content */}
      {!collapsed && (
        <div className="space-y-1 pl-1">
          {children}
        </div>
      )}
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
