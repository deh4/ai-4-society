import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Globe } from '../components/Globe';
import { Suspense } from 'react';

export default function HeroPage() {
    const navigate = useNavigate();

    return (
        <div className="relative w-full h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* 3D Background */}
            <div className="absolute inset-0 z-0 opacity-60">
                <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
                    <Suspense fallback={null}>
                        <Globe />
                    </Suspense>
                </Canvas>
            </div>

            {/* Main Content Overlay */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4">
                <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-xl"
                    style={{ fontFamily: 'var(--font-heading)' }}>
                    Are we shaping AI, <br />
                    or is it shaping us?
                </h1>

                <p className="text-lg md:text-xl text-gray-300 mb-12 max-w-2xl font-light">
                    Real-time tracking of the 40+ existential shifts redefining human society.
                </p>

                <button
                    onClick={() => navigate('/dashboard')}
                    className="px-8 py-3 text-lg font-semibold tracking-wider uppercase border border-[var(--accent-structural)] text-[var(--accent-structural)] hover:bg-[var(--accent-structural)] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(42,157,255,0.3)]"
                >
                    [ Enter the Observatory ]
                </button>
            </div>

            {/* Feature Hints (Bottom) */}
            <div className="absolute bottom-10 left-0 w-full flex justify-center gap-8 px-4 flex-wrap z-20 pointer-events-none">
                <FeatureHint
                    icon="⏳"
                    title="The Time Machine"
                    desc="See how today's fake news becomes 2035's reality collapse."
                />
                <FeatureHint
                    icon="🕸️"
                    title="The Spider Web"
                    desc="See the invisible threads connecting Energy, War, and Algorithms."
                />
                <FeatureHint
                    icon="💓"
                    title="The Public Pulse"
                    desc="Vote on risks. Compare your anxiety against global consensus."
                />
            </div>
        </div>
    );
}

function FeatureHint({ icon, title, desc }: { icon: string, title: string, desc: string }) {
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] p-4 rounded-md backdrop-blur-sm max-w-xs text-left animate-fade-in-up">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{icon}</span>
                <h3 className="font-bold text-sm uppercase text-[var(--accent-structural)]">{title}</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
        </div>
    );
}
