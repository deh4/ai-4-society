export default function TimelineLegend() {
    return (
        <div className="flex items-center gap-4 text-[10px] text-gray-500">
            <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>Risks</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span>Solutions</span>
            </div>
            <span className="text-gray-600">|</span>
            <span className="text-gray-600">Larger node = higher severity/adoption</span>
        </div>
    );
}
