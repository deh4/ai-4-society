import { useNavigate } from 'react-router-dom';

export default function Contribute() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#0a0f1a] text-white flex flex-col">
            {/* Header */}
            <header className="h-14 shrink-0 border-b border-[#1a2035] flex items-center justify-between px-4 md:px-8">
                <button 
                    onClick={() => navigate('/')}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                    <div className="w-7 h-7 rounded-full border-2 border-cyan-400 flex items-center justify-center">
                        <div className="w-1.5 h-3.5 rounded-full bg-cyan-400 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-wide">AI 4 Society</span>
                        <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Observatory</span>
                    </div>
                </button>
                
                <button
                    onClick={() => navigate('/')}
                    className="text-xs uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
                >
                    ← Back to Home
                </button>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-4 md:p-8">
                <div className="max-w-3xl w-full space-y-8">
                    <div className="text-center">
                        <h1 className="text-3xl md:text-5xl font-bold mb-4 text-cyan-400">
                            Join the Observatory
                        </h1>
                        <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
                            Help us track, analyze, and make sense of AI's impact on society
                        </p>
                    </div>

                    <div className="bg-[#0d1526] border border-[#1a2035] rounded-lg p-6 md:p-8">
                        <div className="space-y-6">
                            <div className="p-4 bg-cyan-950/30 border-l-4 border-cyan-400 rounded-r">
                                <h2 className="text-lg font-bold text-cyan-400 mb-2">🚀 Coming Soon</h2>
                                <p className="text-sm text-gray-300">
                                    We're currently building our contributor onboarding platform. Soon you'll be able to:
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white/5 p-4 rounded border border-gray-800">
                                    <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">
                                        📊 Submit Signals
                                    </h3>
                                    <p className="text-xs text-gray-400">
                                        Share relevant news, research, or incidents that impact our risk assessments
                                    </p>
                                </div>

                                <div className="bg-white/5 p-4 rounded border border-gray-800">
                                    <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">
                                        ✍️ Review Content
                                    </h3>
                                    <p className="text-xs text-gray-400">
                                        Help validate narratives, check sources, and ensure accuracy
                                    </p>
                                </div>

                                <div className="bg-white/5 p-4 rounded border border-gray-800">
                                    <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">
                                        🔍 Research Risks
                                    </h3>
                                    <p className="text-xs text-gray-400">
                                        Dive deep into specific domains and contribute expert analysis
                                    </p>
                                </div>

                                <div className="bg-white/5 p-4 rounded border border-gray-800">
                                    <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">
                                        💻 Build Features
                                    </h3>
                                    <p className="text-xs text-gray-400">
                                        Contribute to our open-source codebase and infrastructure
                                    </p>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-800">
                                <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">
                                    Stay Updated
                                </h3>
                                <p className="text-xs text-gray-400 mb-4">
                                    In the meantime, follow our development or reach out to express interest:
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <a 
                                        href="https://github.com" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold tracking-wider uppercase rounded transition-colors text-center"
                                    >
                                        GitHub (Coming Soon)
                                    </a>
                                    <a 
                                        href="mailto:contribute@ai4society.org" 
                                        className="px-6 py-3 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-white text-sm font-semibold tracking-wider uppercase rounded transition-colors text-center"
                                    >
                                        Email Us
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold tracking-wider uppercase rounded transition-colors shadow-lg"
                        >
                            Explore the Observatory →
                        </button>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 border-t border-[#1a2035] text-center">
                <p className="text-xs text-gray-500">
                    AI 4 Society Observatory · A volunteer-driven transparency initiative
                </p>
            </footer>
        </div>
    );
}
