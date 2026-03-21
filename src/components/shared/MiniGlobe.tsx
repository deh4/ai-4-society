import { useEffect, useRef } from "react";

export default function MiniGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const blipsRef = useRef<Array<{ lat: number; lng: number; age: number; maxAge: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 28;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = 11;
    let rotation = 0;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // Globe body — solid cyan fill
      const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r);
      grad.addColorStop(0, "rgba(0,240,255,0.25)");
      grad.addColorStop(0.6, "rgba(0,240,255,0.1)");
      grad.addColorStop(1, "rgba(0,240,255,0.03)");
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Globe outline — strong cyan
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,240,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Latitude lines
      for (let i = -2; i <= 2; i++) {
        const y = cy + i * 4;
        const latR = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
        if (latR > 1) {
          ctx.beginPath();
          ctx.ellipse(cx, y, latR, latR * 0.15, 0, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(0,240,255,0.2)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Rotating meridian lines
      for (let m = 0; m < 3; m++) {
        const angle = rotation + (m * Math.PI * 2) / 3;
        const xOff = Math.sin(angle) * r * 0.3;
        const cosA = Math.abs(Math.cos(angle));
        ctx.beginPath();
        ctx.ellipse(cx + xOff, cy, cosA * r * 0.4 + 1, r, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,240,255,${0.15 + cosA * 0.15})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Random blip spawning
      if (Math.random() < 0.04 && blipsRef.current.length < 5) {
        blipsRef.current.push({
          lat: (Math.random() - 0.5) * 2,
          lng: Math.random() * Math.PI * 2,
          age: 0,
          maxAge: 40 + Math.random() * 40,
        });
      }

      // Draw blips
      blipsRef.current = blipsRef.current.filter((b) => {
        b.age++;
        if (b.age > b.maxAge) return false;

        const angle = b.lng + rotation;
        const visible = Math.cos(angle);
        if (visible < -0.1) return true;

        const x = cx + Math.sin(angle) * r * 0.85 * Math.sqrt(1 - b.lat * b.lat);
        const y = cy + b.lat * r * 0.85;
        const opacity = Math.sin((b.age / b.maxAge) * Math.PI) * (0.5 + visible * 0.5);

        // Bright cyan blip
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,240,255,${opacity})`;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,240,255,${opacity * 0.35})`;
        ctx.fill();

        return true;
      });

      rotation += 0.008;
      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 28, height: 28 }}
      className="shrink-0"
    />
  );
}
