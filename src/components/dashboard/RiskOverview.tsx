import { useState, useMemo } from 'react';
import type { Risk } from '../../store/RiskContext';
import RiskCard from './RiskCard';
import OverviewHeader from './OverviewHeader';

interface RiskOverviewProps {
    risks: Risk[];
    loading: boolean;
    error: string | null;
    onSelectRisk: (id: string) => void;
}

type SortBy = 'severity' | 'velocity' | 'name';

const VELOCITY_ORDER: Record<string, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Emerging: 2,
    Low: 3,
};

interface TierGroup {
    label: string;
    description: string;
    risks: Risk[];
}

function groupByTier(risks: Risk[]): TierGroup[] {
    const critical = risks.filter(r => r.velocity === 'Critical');
    const high = risks.filter(r => r.velocity === 'High');
    const rest = risks.filter(r => !['Critical', 'High'].includes(r.velocity));

    const groups: TierGroup[] = [];
    if (critical.length > 0) {
        groups.push({
            label: 'Critical',
            description: 'Immediate and accelerating threats',
            risks: critical,
        });
    }
    if (high.length > 0) {
        groups.push({
            label: 'High Velocity',
            description: 'Rapidly developing risks',
            risks: high,
        });
    }
    if (rest.length > 0) {
        groups.push({
            label: 'Emerging',
            description: 'Developing trends to watch',
            risks: rest,
        });
    }
    return groups;
}

function sortRisks(risks: Risk[], sortBy: SortBy): Risk[] {
    const sorted = [...risks];
    switch (sortBy) {
        case 'severity':
            return sorted.sort((a, b) => b.score_2026 - a.score_2026);
        case 'velocity':
            return sorted.sort((a, b) =>
                (VELOCITY_ORDER[a.velocity] ?? 99) - (VELOCITY_ORDER[b.velocity] ?? 99)
                || b.score_2026 - a.score_2026
            );
        case 'name':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        default:
            return sorted;
    }
}

export default function RiskOverview({ risks, loading, error, onSelectRisk }: RiskOverviewProps) {
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<SortBy>('severity');

    const categories = useMemo(() => {
        const cats = [...new Set(risks.map(r => r.category))];
        return cats.sort();
    }, [risks]);

    const filteredRisks = useMemo(() => {
        const filtered = activeCategory
            ? risks.filter(r => r.category === activeCategory)
            : risks;
        return sortRisks(filtered, sortBy);
    }, [risks, activeCategory, sortBy]);

    const tierGroups = useMemo(() => groupByTier(filteredRisks), [filteredRisks]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-gray-500 text-sm">Loading observatory data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-red-400 text-sm">{error}</div>
            </div>
        );
    }

    // Track card index across groups for staggered animation
    let cardIndex = 0;

    return (
        <div>
            <OverviewHeader
                riskCount={risks.length}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                sortBy={sortBy}
                onSortChange={setSortBy}
                categories={categories}
            />

            {tierGroups.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-12">
                    No risks match the selected filter.
                </div>
            ) : (
                <div className="space-y-10">
                    {tierGroups.map((group) => (
                        <section key={group.label}>
                            {/* Section header */}
                            <div className="flex items-center gap-3 mb-4">
                                <h2 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                                    {group.label}
                                </h2>
                                <div className="flex-1 h-px bg-white/5" />
                                <span className="text-[10px] text-gray-600">
                                    {group.risks.length} risk{group.risks.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Card grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {group.risks.map((risk) => {
                                    const idx = cardIndex++;
                                    return (
                                        <RiskCard
                                            key={risk.id}
                                            risk={risk}
                                            index={idx}
                                            onClick={onSelectRisk}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
