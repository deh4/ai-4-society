import type { SignalEvidence } from '../../store/RiskContext';

interface SignalEvidenceListProps {
    evidence: SignalEvidence[];
}

export default function SignalEvidenceList({ evidence }: SignalEvidenceListProps) {
    if (!evidence || evidence.length === 0) {
        return <div className="text-gray-600 text-xs">No signals available</div>;
    }

    return (
        <div className="space-y-3">
            {evidence.map((item, idx) => {
                const content = (
                    <>
                        <div className="text-[10px] text-gray-600 w-10 shrink-0">{item.date}</div>
                        <div className="flex-1">
                            {item.isLive && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5" />
                            )}
                            {item.isNew && (
                                <span className="text-[8px] bg-red-500 text-white px-1 rounded mr-1">NEW</span>
                            )}
                            <span className={`text-xs ${item.url ? 'group-hover:text-cyan-400 decoration-cyan-400 group-hover:underline' : ''}`}>
                                {item.headline}
                                {item.url && <span className="inline-block ml-1 text-gray-500">↗</span>}
                            </span>
                            <div className="text-[9px] text-gray-500 uppercase mt-0.5">{item.source}</div>
                        </div>
                    </>
                );

                return item.url ? (
                    <a
                        key={idx}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex gap-2 p-2 rounded bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group"
                    >
                        {content}
                    </a>
                ) : (
                    <div key={idx} className="flex gap-2 p-2 rounded bg-white/5">
                        {content}
                    </div>
                );
            })}
        </div>
    );
}
