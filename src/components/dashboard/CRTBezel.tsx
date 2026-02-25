interface CRTBezelProps {
    children: React.ReactNode;
}

export default function CRTBezel({ children }: CRTBezelProps) {
    return (
        <div className="relative rounded-2xl overflow-hidden"
            style={{
                background: '#0a1a0f',
                boxShadow: 'inset 0 0 30px rgba(0,255,65,0.05), 0 0 20px rgba(0,255,65,0.03)',
                border: '2px solid #1a3a2a',
            }}
        >
            {/* Scanline overlay */}
            <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 3px)',
                }}
            />
            {/* Content */}
            <div className="relative z-0">
                {children}
            </div>
        </div>
    );
}
