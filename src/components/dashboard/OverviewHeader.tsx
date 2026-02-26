interface OverviewHeaderProps {
    riskCount: number;
    activeCategory: string | null;
    onCategoryChange: (category: string | null) => void;
    sortBy: 'severity' | 'velocity' | 'name';
    onSortChange: (sort: 'severity' | 'velocity' | 'name') => void;
    categories: string[];
}

const SORT_LABELS: Record<string, string> = {
    severity: 'Severity',
    velocity: 'Velocity',
    name: 'A–Z',
};

export default function OverviewHeader({
    riskCount,
    activeCategory,
    onCategoryChange,
    sortBy,
    onSortChange,
    categories,
}: OverviewHeaderProps) {
    return (
        <div className="mb-8">
            {/* Headline */}
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    {riskCount} risks reshaping society
                </h1>
                <p className="text-sm sm:text-base text-gray-400">
                    Tracked by 6 autonomous AI agents. Updated daily.
                </p>
            </div>

            {/* Filters + Sort */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Category pills */}
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => onCategoryChange(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            activeCategory === null
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                        }`}
                    >
                        All
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => onCategoryChange(cat)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                activeCategory === cat
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Sort control */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-gray-600 mr-1">Sort</span>
                    {(['severity', 'velocity', 'name'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => onSortChange(s)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                                sortBy === s
                                    ? 'bg-white/10 text-white'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {SORT_LABELS[s]}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
