import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Globe } from '../components/Globe';
import { Suspense, useState } from 'react';
import { PrivacyModal } from '../components/PrivacyModal';
import { AboutModal } from '../components/AboutModal';

export default function HeroPage() {
    const navigate = useNavigate();
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [showAbout, setShowAbout] = useState(false);

    const handleEnter = () => {
        navigate('/dashboard');
    };

    return (
        <div className="relative w-full min-h-screen overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* 3D Background */}
            <div className="absolute inset-0 z-0 opacity-60">
                <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
                    <Suspense fallback={null}>
                        <Globe />
                    </Suspense>
                </Canvas>
            </div>

            {/* Main Content Overlay */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4 py-12">
                <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-xl"
                    style={{ fontFamily: 'var(--font-heading)' }}>
                    Are we shaping AI, <br />
                    or is it shaping us?
                </h1>

                <p className="text-lg md:text-xl text-gray-300 mb-8 md:mb-12 max-w-2xl font-light">
                    Real-time tracking of the 40+ existential shifts redefining human society.
                </p>

                {/* Buttons - Vertical on mobile, Horizontal on desktop */}
                <div className="flex flex-col md:flex-row gap-4 w-full max-w-md md:max-w-4xl">
                    <button
                        onClick={() => setShowDisclaimer(true)}
                        className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-[var(--accent-structural)] text-[var(--accent-structural)] hover:bg-[var(--accent-structural)] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(42,157,255,0.3)] rounded"
                    >
                        [ Enter Observatory ]
                    </button>
                    <button
                        onClick={() => setShowAbout(true)}
                        className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-cyan-600 text-cyan-400 hover:bg-cyan-600 hover:text-white transition-all duration-300 rounded"
                    >
                        What is AI-4-Society?
                    </button>
                    <button
                        onClick={() => navigate('/contribute')}
                        className="px-6 md:px-8 py-4 text-sm md:text-base font-semibold tracking-wider uppercase border-2 border-green-600 text-green-400 hover:bg-green-600 hover:text-white transition-all duration-300 rounded"
                    >
                        I want to contribute
                    </button>
                </div>
            </div>

            {showDisclaimer && (
                <PrivacyModal
                    onClose={() => setShowDisclaimer(false)}
                    onConfirm={handleEnter}
                />
            )}

            {showAbout && (
                <AboutModal onClose={() => setShowAbout(false)} />
            )}
        </div>
    );
}

