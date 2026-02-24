import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TimelineItem } from '../../lib/derivePeakYear';

interface TimelinePinProps {
    item: TimelineItem;
    stemLength: number;
    onClick: (item: TimelineItem) => void;
    orientation: 'horizontal' | 'vertical';
}

const VELOCITY_SIZE: Record<string, number> = {
    Critical: 14,
    High: 12,
    Medium: 10,
    Emerging: 10,
    Low: 8,
    // Solution stages
    Deployed: 14,
    Scaling: 12,
    Piloting: 10,
    Proposed: 8,
    Concept: 8,
};

export default function TimelinePin({ item, stemLength, onClick, orientation }: TimelinePinProps) {
    const [hovered, setHovered] = useState(false);
    const isRisk = item.type === 'risk';
    const nodeSize = VELOCITY_SIZE[item.velocity] ?? 10;
    const nodeColor = isRisk ? 'bg-red-500' : 'bg-green-500';
    const labelColor = isRisk ? 'text-red-400' : 'text-green-400';
    const stemColor = isRisk ? 'bg-red-500/30' : 'bg-green-500/30';

    if (orientation === 'vertical') {
        // Vertical layout: pin extends horizontally from the axis
        // Risks go left, solutions go right
        return (
            <motion.button
                onClick={() => onClick(item)}
                onHoverStart={() => setHovered(true)}
                onHoverEnd={() => setHovered(false)}
                className={`flex items-center gap-0 cursor-pointer ${isRisk ? 'flex-row-reverse' : 'flex-row'}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
            >
                {/* Stem */}
                <div className={`${stemColor} h-0.5`} style={{ width: stemLength }} />

                {/* Node + Label */}
                <div className={`flex items-center gap-1.5 ${isRisk ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div
                        className={`rounded-full ${nodeColor} shrink-0 transition-all ${hovered ? 'ring-2 ring-white/20' : ''}`}
                        style={{ width: nodeSize, height: nodeSize }}
                    />
                    <div className={`${isRisk ? 'text-right' : 'text-left'}`}>
                        <div className={`text-xs font-bold ${labelColor}`}>
                            {item.label}
                            <span className="text-[10px] text-gray-500 ml-1">{item.score}</span>
                        </div>
                        {hovered && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-[10px] text-gray-400 max-w-[160px] line-clamp-2"
                            >
                                {item.name}
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.button>
        );
    }

    // Horizontal layout: pin extends vertically from the axis
    // Risks go up, solutions go down
    const isAbove = isRisk;

    return (
        <motion.button
            onClick={() => onClick(item)}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            className={`flex flex-col items-center gap-0 cursor-pointer ${isAbove ? 'flex-col-reverse' : 'flex-col'}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
        >
            {/* Node + Label */}
            <div className="flex flex-col items-center gap-1">
                {!isAbove && (
                    <div
                        className={`rounded-full ${nodeColor} shrink-0 transition-all ${hovered ? 'ring-2 ring-white/20' : ''}`}
                        style={{ width: nodeSize, height: nodeSize }}
                    />
                )}
                <div className="text-center">
                    <div className={`text-xs font-bold ${labelColor}`}>
                        {item.label}
                        <span className="text-[10px] text-gray-500 ml-1">{item.score}</span>
                    </div>
                    {hovered && (
                        <motion.div
                            initial={{ opacity: 0, y: isAbove ? -4 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[10px] text-gray-400 max-w-[120px] mx-auto line-clamp-2"
                        >
                            {item.name}
                        </motion.div>
                    )}
                </div>
                {isAbove && (
                    <div
                        className={`rounded-full ${nodeColor} shrink-0 transition-all ${hovered ? 'ring-2 ring-white/20' : ''}`}
                        style={{ width: nodeSize, height: nodeSize }}
                    />
                )}
            </div>

            {/* Stem */}
            <div className={`${stemColor} w-0.5`} style={{ height: stemLength }} />
        </motion.button>
    );
}
