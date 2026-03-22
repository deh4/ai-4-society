import type { Risk, Solution } from '../../store/RiskContext';

interface PerceptionGapProps {
    isMonitorMode: boolean;
    selectedRisk: Risk | undefined;
    selectedSolution: Solution | undefined;
}

export default function PerceptionGap({ isMonitorMode, selectedRisk, selectedSolution }: PerceptionGapProps) {
    if (selectedRisk && isMonitorMode) {
        return (
            <div className="space-y-3">
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Expert Assessment</span>
                        <span className="text-red-400 font-bold">{selectedRisk.expert_severity}</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${(selectedRisk.expert_severity || 0) * 10}%` }} />
                    </div>
                </div>
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Public Awareness</span>
                        <span className="text-cyan-400 font-bold">{selectedRisk.public_perception}</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                        <div className="h-full bg-cyan-500" style={{ width: `${(selectedRisk.public_perception || 0) * 10}%` }} />
                    </div>
                </div>
                {selectedRisk.expert_severity && selectedRisk.public_perception &&
                    (selectedRisk.expert_severity - selectedRisk.public_perception) > 2 && (
                        <div className="text-[10px] text-yellow-400 mt-2">
                            ⚠ Significant awareness gap
                        </div>
                    )}
            </div>
        );
    }

    if (selectedSolution && !isMonitorMode) {
        return (
            <div className="space-y-3">
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Current</span>
                        <span className="text-green-400 font-bold">{selectedSolution.score_2026}</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${(selectedSolution.score_2026 || 0) * 10}%` }} />
                    </div>
                </div>
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">2035 Projected</span>
                        <span className="text-green-400 font-bold">{selectedSolution.score_2035}</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded overflow-hidden">
                        <div className="h-full bg-green-400" style={{ width: `${(selectedSolution.score_2035 || 0) * 10}%` }} />
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
