import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AI_MILESTONES } from '../lib/milestones';

export interface SignalEvidence {
    date: string;
    isNew: boolean;
    headline: string;
    source: string;
    url?: string;
    isLive?: boolean;
}

export interface TimelineNarrative {
    near_term: string;
    mid_term: string;
    long_term: string;
}

export interface Risk {
    id: string;
    name: string;
    category: string;
    score_2026: number;
    score_2035: number;
    velocity: 'High' | 'Medium' | 'Low' | 'Critical';
    summary: string;
    deep_dive: string;
    timeline_narrative: TimelineNarrative;
    mitigation_strategies: string[];
    principles: string[];
    signal_evidence: SignalEvidence[];
    expert_severity: number;
    public_perception: number;
}

export interface Solution {
    id: string;
    name: string;
    solution_type: string;
    summary: string;
    deep_dive: string;
    implementation_stage: string;
    score_2026: number;
    score_2035: number;
    key_players: string[];
    barriers: string[];
    principles: string[];
    timeline_narrative: TimelineNarrative;
}

interface LiveSignal {
    id: string;
    title: string;
    summary: string;
    source_url: string;
    source_name: string;
    published_date: string;
    related_node_ids: string[];
}

export interface Milestone {
    id: string;
    name: string;
    description: string;
    date: string;
    significance: string;
}

interface RiskContextType {
    risks: Risk[];
    solutions: Solution[];
    milestones: Milestone[];
    loading: boolean;
    error: string | null;
}

const RiskContext = createContext<RiskContextType | undefined>(undefined);

export function RiskProvider({ children }: { children: ReactNode }) {
    const [baseRisks, setBaseRisks] = useState<Risk[]>([]);
    const [solutions, setSolutions] = useState<Solution[]>([]);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [liveSignals, setLiveSignals] = useState<LiveSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch base risks, solutions, milestones from nodes collection (one-time)
    useEffect(() => {
        async function fetchData() {
            try {
                const risksSnapshot = await getDocs(query(collection(db, 'nodes'), where('type', '==', 'risk')));
                const fetchedRisks: Risk[] = [];
                risksSnapshot.forEach((doc) => {
                    const data = doc.data();
                    fetchedRisks.push({
                        id: doc.id,
                        name: data.name ?? '',
                        category: data.category ?? '',
                        score_2026: data.score_2026 ?? 0,
                        score_2035: data.score_2035 ?? 0,
                        velocity: data.velocity ?? 'Medium',
                        summary: data.summary ?? '',
                        deep_dive: data.deep_dive ?? '',
                        timeline_narrative: data.timeline_narrative ?? { near_term: '', mid_term: '', long_term: '' },
                        mitigation_strategies: data.mitigation_strategies ?? [],
                        principles: data.principles ?? [],
                        signal_evidence: data.signal_evidence ?? [],
                        expert_severity: data.expert_severity ?? 0,
                        public_perception: data.public_perception ?? 0,
                    });
                });
                setBaseRisks(fetchedRisks);

                const solutionsSnapshot = await getDocs(query(collection(db, 'nodes'), where('type', '==', 'solution')));
                const fetchedSolutions: Solution[] = [];
                solutionsSnapshot.forEach((doc) => {
                    const data = doc.data();
                    fetchedSolutions.push({
                        id: doc.id,
                        name: data.name ?? '',
                        solution_type: data.solution_type ?? '',
                        summary: data.summary ?? '',
                        deep_dive: data.deep_dive ?? '',
                        implementation_stage: data.implementation_stage ?? 'Research',
                        score_2026: data.score_2026 ?? 0,
                        score_2035: data.score_2035 ?? 0,
                        key_players: data.key_players ?? [],
                        barriers: data.barriers ?? [],
                        principles: data.principles ?? [],
                        timeline_narrative: data.timeline_narrative ?? { near_term: '', mid_term: '', long_term: '' },
                    });
                });
                setSolutions(fetchedSolutions);

                const milestonesSnapshot = await getDocs(query(collection(db, 'nodes'), where('type', '==', 'milestone')));
                const fetchedMilestones: Milestone[] = [];
                milestonesSnapshot.forEach((doc) => {
                    const data = doc.data();
                    fetchedMilestones.push({
                        id: doc.id,
                        name: data.name ?? '',
                        description: data.description ?? '',
                        date: data.date ?? '',
                        significance: data.significance ?? '',
                    });
                });
                // Fall back to hardcoded milestones if Firestore collection is empty
                if (fetchedMilestones.length > 0) {
                    setMilestones(fetchedMilestones);
                } else {
                    // Convert legacy milestone format to V3 format
                    setMilestones(AI_MILESTONES.map((m) => ({
                        id: m.id,
                        name: m.title,
                        description: m.description,
                        date: String(m.year),
                        significance: '',
                    })));
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to fetch data';
                console.error("Error fetching data:", err);
                setError(message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Subscribe to approved live signals (real-time)
    useEffect(() => {
        const q = query(
            collection(db, 'signals'),
            where('status', 'in', ['approved', 'edited'])
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const signals: LiveSignal[] = snapshot.docs.map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    title: data.title ?? '',
                    summary: data.summary ?? '',
                    source_url: data.source_url ?? '',
                    source_name: data.source_name ?? '',
                    published_date: data.published_date ?? '',
                    // Use related_node_ids from V2 signals
                    related_node_ids: data.related_node_ids ?? [],
                } as LiveSignal;
            });
            setLiveSignals(signals);
        }, (err) => {
            console.error("Error subscribing to live signals:", err);
        });
        return unsubscribe;
    }, []);

    // Merge live signals into risks
    const risks = useMemo(() => {
        if (liveSignals.length === 0) return baseRisks;

        return baseRisks.map((risk) => {
            const matching = liveSignals.filter((s) =>
                s.related_node_ids?.includes(risk.id) ?? false
            );
            if (matching.length === 0) return risk;

            const existingUrls = new Set(
                risk.signal_evidence.map((se) => se.url).filter(Boolean)
            );

            const newEvidence: SignalEvidence[] = matching
                .filter((s) => !existingUrls.has(s.source_url))
                .map((s) => ({
                    date: s.published_date?.slice(0, 10) ?? '',
                    isNew: true,
                    headline: s.title,
                    source: s.source_name,
                    url: s.source_url,
                    isLive: true,
                }));

            return {
                ...risk,
                signal_evidence: [...newEvidence, ...risk.signal_evidence],
            };
        });
    }, [baseRisks, liveSignals]);

    return (
        <RiskContext.Provider value={{ risks, solutions, milestones, loading, error }}>
            {children}
        </RiskContext.Provider>
    );
}

export function useRisks() {
    const context = useContext(RiskContext);
    if (context === undefined) {
        throw new Error('useRisks must be used within a RiskProvider');
    }
    return context;
}
