"use client";

import { useEffect, useRef } from "react";

export function HistogramBlock({
  values,
  min,
  max,
  bins,
}: {
  values: number[];
  min: number;
  max: number;
  bins: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (values.length === 0) {
      ctx.fillStyle = "rgba(154,154,163,0.6)";
      ctx.font = "11px Inter,system-ui";
      ctx.textAlign = "center";
      ctx.fillText("no data", W / 2, H / 2);
      return;
    }
    const counts = new Array(bins).fill(0);
    for (const v of values) {
      const idx = Math.max(0, Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins)));
      counts[idx]++;
    }
    const peak = Math.max(...counts);
    const padL = 24;
    const padB = 18;
    const padT = 8;
    const padR = 6;
    const w = (W - padL - padR) / bins;
    counts.forEach((c2, i) => {
      const h = ((c2 / peak) * (H - padT - padB)) || 0;
      const x = padL + i * w;
      const y = H - padB - h;
      ctx.fillStyle = "rgba(31,122,140,0.6)";
      ctx.fillRect(x + 1, y, w - 2, h);
    });
    ctx.fillStyle = "rgba(154,154,163,0.7)";
    ctx.font = "10px JetBrains Mono,monospace";
    ctx.textAlign = "left";
    ctx.fillText(min.toString(), padL, H - 4);
    ctx.textAlign = "right";
    ctx.fillText(max.toString(), W - padR, H - 4);
  }, [values, min, max, bins]);
  return <canvas ref={ref} className="h-40 w-full" />;
}
