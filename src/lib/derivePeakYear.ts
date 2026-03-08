import type { Risk, Solution, Milestone } from '../store/RiskContext';

const VELOCITY_OFFSET: Record<string, number> = {
    Critical: 0,
    High: 2,
    Medium: 5,
    Emerging: 7,
    Low: 9,
};

const STAGE_OFFSET: Record<string, number> = {
    'Early Adoption': 1,
    'Pilot Programs': 3,
    'Advocacy': 5,
    'Policy Debate': 6,
    'Negotiation': 7,
    'Research': 8,
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export interface TimelineItem {
    id: string;
    label: string;
    name: string;
    score: number;
    peakYear: number;
    type: 'risk' | 'solution' | 'milestone';
    velocity: string;
    parentRiskId?: string;
    description?: string;
}

export function deriveRiskPeakYear(risk: Risk): number {
    const base = VELOCITY_OFFSET[risk.velocity] ?? 5;
    const trend = (risk.score_2035 - risk.score_2026) > 0 ? 2 : -1;
    return clamp(2026 + base + trend, 2026, 2038);
}

export function deriveSolutionPeakYear(solution: Solution): number {
    const base = STAGE_OFFSET[solution.implementation_stage] ?? 5;
    const trend = (solution.adoption_score_2035 - solution.adoption_score_2026) > 0 ? -1 : 2;
    return clamp(2026 + base + trend, 2026, 2038);
}

function milestoneToTimelineItem(m: Milestone): TimelineItem {
    return {
        id: m.id,
        label: m.id,
        name: m.title,
        score: 0,
        peakYear: m.year,
        type: 'milestone',
        velocity: '',
        description: m.description,
    };
}

export function buildTimelineItems(risks: Risk[], solutions: Solution[], milestones: Milestone[]): TimelineItem[] {
    const items: TimelineItem[] = [];

    // Milestones (historical)
    for (const milestone of milestones) {
        items.push(milestoneToTimelineItem(milestone));
    }

    // Risks (future)
    for (const risk of risks) {
        items.push({
            id: risk.id,
            label: risk.id,
            name: risk.risk_name,
            score: risk.score_2026,
            peakYear: deriveRiskPeakYear(risk),
            type: 'risk',
            velocity: risk.velocity,
        });
    }

    // Solutions (future)
    for (const solution of solutions) {
        items.push({
            id: solution.id,
            label: solution.id,
            name: solution.solution_title,
            score: solution.adoption_score_2026,
            peakYear: deriveSolutionPeakYear(solution),
            type: 'solution',
            velocity: solution.implementation_stage,
            parentRiskId: solution.parent_risk_id,
        });
    }

    return items;
}
