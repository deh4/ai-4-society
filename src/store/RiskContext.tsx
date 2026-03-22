import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { collection, getDocs, query, where, onSnapshot, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AI_MILESTONES } from '../lib/milestones';

// NOTE: This store reads from the unified `nodes` collection, filtering by type.

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
    connected_to: string[];
    velocity: 'High' | 'Medium' | 'Low' | 'Critical';
    summary: string;
    deep_dive: string;
    who_affected: string[];
    timeline_narrative: TimelineNarrative;
    mitigation_strategies: string[];
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
    timeline_narrative: TimelineNarrative;
}

interface LiveSignal {
    id: string;
    title: string;
    summary: string;
    source_url: string;
    source_name: string;
    published_date: string;
    risk_categories: string[];
}

export interface Milestone {
    id: string;
    year: number;
    title: string;
    description: string;
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

    // Fetch base risks and solutions (one-time)
    useEffect(() => {
        async function fetchData() {
            try {
                const nodesCollection = collection(db, 'nodes');

                const risksSnapshot: QuerySnapshot<DocumentData> = await getDocs(
                    query(nodesCollection, where('type', '==', 'risk'))
                );
                const fetchedRisks: Risk[] = [];
                risksSnapshot.forEach((doc) => {
                    fetchedRisks.push({ id: doc.id, ...doc.data() } as Risk);
                });
                setBaseRisks(fetchedRisks);

                const solutionsSnapshot: QuerySnapshot<DocumentData> = await getDocs(
                    query(nodesCollection, where('type', '==', 'solution'))
                );
                const fetchedSolutions: Solution[] = [];
                solutionsSnapshot.forEach((doc) => {
                    fetchedSolutions.push({ id: doc.id, ...doc.data() } as Solution);
                });
                setSolutions(fetchedSolutions);

                const milestonesSnapshot: QuerySnapshot<DocumentData> = await getDocs(
                    query(nodesCollection, where('type', '==', 'milestone'))
                );
                const fetchedMilestones: Milestone[] = [];
                milestonesSnapshot.forEach((doc) => {
                    fetchedMilestones.push({ id: doc.id, ...doc.data() } as Milestone);
                });
                // Fall back to hardcoded milestones if Firestore collection is empty
                setMilestones(fetchedMilestones.length > 0 ? fetchedMilestones : AI_MILESTONES);
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
                    // Ensure required fields exist with defaults
                    risk_categories: data.risk_categories ?? [],
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
                s.risk_categories?.includes(risk.id) ?? false
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
