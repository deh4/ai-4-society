export default function TimelineLegend() {
    return (
        <div className="flex items-center gap-4 text-[9px] font-mono uppercase tracking-widest text-gray-500">
            <div className="flex items-center gap-1.5">
                <div className="w-0.5 h-3 rounded-full bg-red-500" />
                <span>Risks</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-0.5 h-3 rounded-full bg-emerald-400" />
                <span>Solutions</span>
            </div>
        </div>
    );
}
