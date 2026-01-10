import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SignalEvidence {
    date: string;
    isNew: boolean;
    headline: string;
    source: string;
    url?: string;
}

export interface TimelineNarrative {
    near_term: string;
    mid_term: string;
    long_term: string;
}

export interface Risk {
    id: string;
    risk_name: string;
    category: string;
    score_2026: number;
    score_2035: number;
    connected_to: string[];
    velocity: 'High' | 'Medium' | 'Low' | 'Critical';

    // Rich content fields
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
    parent_risk_id: string;
    solution_title: string;
    solution_type: string;
    summary: string;
    deep_dive: string;
    implementation_stage: string;
    adoption_score_2026: number;
    adoption_score_2035: number;
    key_players: string[];
    barriers: string[];
    timeline_narrative: TimelineNarrative;
}

interface RiskContextType {
    risks: Risk[];
    solutions: Solution[];
    loading: boolean;
    error: string | null;
}

const RiskContext = createContext<RiskContextType | undefined>(undefined);

export function RiskProvider({ children }: { children: ReactNode }) {
    const [risks, setRisks] = useState<Risk[]>([]);
    const [solutions, setSolutions] = useState<Solution[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch risks
                const risksSnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'risks'));
                const fetchedRisks: Risk[] = [];
                risksSnapshot.forEach((doc) => {
                    fetchedRisks.push({ id: doc.id, ...doc.data() } as Risk);
                });
                setRisks(fetchedRisks);

                // Fetch solutions
                const solutionsSnapshot: QuerySnapshot<DocumentData> = await getDocs(collection(db, 'solutions'));
                const fetchedSolutions: Solution[] = [];
                solutionsSnapshot.forEach((doc) => {
                    fetchedSolutions.push({ id: doc.id, ...doc.data() } as Solution);
                });
                setSolutions(fetchedSolutions);
            } catch (err: any) {
                console.error("Error fetching data:", err);
                setError(err.message || 'Failed to fetch data');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    return (
        <RiskContext.Provider value={{ risks, solutions, loading, error }}>
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
