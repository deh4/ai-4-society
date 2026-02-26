import { useNavigate, useParams } from 'react-router-dom';
import { useRisks } from '../store/RiskContext';
import { useAuth } from '../store/AuthContext';
import TimelineView from '../components/dashboard/TimelineView';
import RiskDetailPanel from '../components/dashboard/RiskDetailPanel';

export default function Dashboard() {
    const { riskId } = useParams<{ riskId?: string }>();
    const { risks, solutions, milestones, loading, error } = useRisks();
    const { user, isAdmin, signIn, logOut } = useAuth();
    const navigate = useNavigate();

    const selectedRisk = riskId ? risks.find(r => r.id === riskId) : undefined;
    const relatedSolution = selectedRisk
        ? solutions.find(s => s.parent_risk_id === selectedRisk.id)
        : undefined;

    const handleSelectRisk = (id: string) => {
        navigate(`/dashboard/${id}`);
    };

    const handleBack = () => {
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#0a0f1a] text-white font-sans">
            {/* Header */}
            <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-[#1a2035] flex items-center justify-between px-4 sm:px-6 bg-[#0a0f1a]/95 backdrop-blur-sm">
                {/* Left: Logo */}
                <button
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-2.5"
                >
                    <div className="w-7 h-7 rounded-full border-2 border-cyan-400 flex items-center justify-center">
                        <div className="w-1.5 h-3.5 rounded-full bg-cyan-400 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-wide">AI 4 Society</span>
                        <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Observatory</span>
                    </div>
                </button>

                {/* Right: Auth + links */}
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => navigate('/contribute')}
                        className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors hidden sm:block"
                    >
                        Contribute
                    </button>
                    {user ? (
                        <>
                            {isAdmin && (
                                <button
                                    onClick={() => navigate('/admin')}
                                    className="text-[10px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors"
                                >
                                    Admin
                                </button>
                            )}
                            <button
                                onClick={logOut}
                                className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
                            >
                                Sign Out
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={signIn}
                            className="text-[10px] uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                            Sign In
                        </button>
                    )}
                </div>
            </header>

            {/* Content */}
            <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                {riskId && selectedRisk ? (
                    <RiskDetailPanel
                        risk={selectedRisk}
                        relatedSolution={relatedSolution}
                        onBack={handleBack}
                    />
                ) : riskId && !loading ? (
                    <div className="text-center py-20">
                        <div className="text-gray-500 mb-4">Risk not found</div>
                        <button
                            onClick={handleBack}
                            className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                            &larr; Back to overview
                        </button>
                    </div>
                ) : (
                    <TimelineView
                        risks={risks}
                        solutions={solutions}
                        milestones={milestones}
                        loading={loading}
                        error={error}
                        onSelectRisk={handleSelectRisk}
                    />
                )}
            </main>

            {/* Footer */}
            <footer className="border-t border-white/5 px-4 sm:px-6 py-6 mt-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-gray-600 max-w-5xl mx-auto">
                    <span>AI 4 Society Observatory — Real-time AI risk intelligence</span>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="hover:text-gray-400 transition-colors"
                        >
                            About
                        </button>
                        <button
                            onClick={() => navigate('/contribute')}
                            className="hover:text-gray-400 transition-colors"
                        >
                            Contribute
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
