// src/components/landing/HalftoneMask.tsx

interface HalftoneMaskProps {
  id?: string;
  rows?: number;
  cols?: number;
}

export default function HalftoneMask({
  id = "halftone-mask",
  rows = 30,
  cols = 40,
}: HalftoneMaskProps) {
  const dots: Array<{ cx: number; cy: number; r: number; opacity: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = ((col + 0.5) / cols) * 100;
      const y = ((row + 0.5) / rows) * 100;

      // Progress from top (0) to bottom (1)
      const progress = row / (rows - 1);

      // Non-linear: stay dense through bottom 60%, fade rapidly above
      const t = Math.min(1, progress / 0.6);
      const factor = t * t; // quadratic ease-in

      const maxRadius = (100 / cols) * 0.45;
      const r = maxRadius * factor;
      const opacity = factor;

      if (r > 0.05) {
        dots.push({ cx: x, cy: y, r, opacity });
      }
    }
  }

  return (
    <svg
      className="absolute inset-0 w-0 h-0"
      aria-hidden="true"
    >
      <defs>
        <mask id={id} maskContentUnits="objectBoundingBox">
          {/* Black background = fully transparent */}
          <rect width="1" height="1" fill="black" />
          {/* White circles = visible areas */}
          {dots.map((dot, i) => (
            <circle
              key={i}
              cx={dot.cx / 100}
              cy={dot.cy / 100}
              r={dot.r / 100}
              fill="white"
              fillOpacity={dot.opacity}
            />
          ))}
        </mask>
      </defs>
    </svg>
  );
}
