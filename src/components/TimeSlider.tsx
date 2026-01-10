import React from 'react';

interface TimeSliderProps {
    year: number;
    setYear: (year: number) => void;
}

export default function TimeSlider({ year, setYear }: TimeSliderProps) {
    const min = 2026;
    const max = 2050;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setYear(parseInt(e.target.value));
    };

    return (
        <div className="w-full flex flex-col items-center">
            <div className="w-full flex justify-between text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-widest">
                <span>Present Day ({min})</span>
                <span className="text-[var(--accent-structural)] font-bold text-lg">{year}</span>
                <span>Singularity ({max})</span>
            </div>

            <input
                type="range"
                min={min}
                max={max}
                value={year}
                onChange={handleChange}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[var(--accent-structural)] hover:accent-white transition-all"
            />
        </div>
    );
}
