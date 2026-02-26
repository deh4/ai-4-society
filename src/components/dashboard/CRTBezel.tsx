interface CRTBezelProps {
    children: React.ReactNode;
}

export default function CRTBezel({ children }: CRTBezelProps) {
    return (
        <div className="relative rounded-2xl overflow-hidden"
            style={{
                background: '#0a0f1a',
                boxShadow: 'inset 0 0 40px rgba(255,255,255,0.02), 0 0 20px rgba(0,255,65,0.03)',
                border: '2px solid rgba(255,255,255,0.08)',
            }}
        >
            {/* Scanline overlay */}
            <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)',
                }}
            />
            {/* Edge glow */}
            <div
                className="absolute inset-0 pointer-events-none z-10 rounded-2xl"
                style={{
                    boxShadow: 'inset 0 0 60px rgba(0,255,65,0.03)',
                }}
            />
            {/* Content */}
            <div className="relative z-0">
                {children}
            </div>
        </div>
    );
}
