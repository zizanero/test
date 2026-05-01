"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#1f7a8c", "#7e57c2", "#fbbf24", "#4ade80", "#f87171", "#60a5fa"];

interface Point {
  tick: number;
  [k: string]: number;
}

export function TimeSeriesBlock({
  data,
  xKey,
  yKeys,
}: {
  data: Point[];
  xKey: string;
  yKeys: string[];
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

    if (data.length === 0) {
      ctx.fillStyle = "rgba(154,154,163,0.6)";
      ctx.font = "11px Inter,system-ui";
      ctx.textAlign = "center";
      ctx.fillText("no data", W / 2, H / 2);
      return;
    }
    const padL = 30;
    const padR = 6;
    const padT = 8;
    const padB = 18;
    const xs = data.map((p) => Number(p[xKey]) || 0);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    let yMax = 1;
    for (const p of data)
      for (const k of yKeys) yMax = Math.max(yMax, Number(p[k]) || 0);

    function px(x: number) {
      return padL + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - padL - padR);
    }
    function py(y: number) {
      return H - padB - (y / yMax) * (H - padT - padB);
    }

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB);
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.stroke();

    ctx.fillStyle = "rgba(154,154,163,0.7)";
    ctx.font = "10px JetBrains Mono,monospace";
    ctx.textAlign = "right";
    ctx.fillText(yMax.toFixed(0), padL - 4, padT + 8);
    ctx.fillText("0", padL - 4, H - padB);
    ctx.textAlign = "left";
    ctx.fillText(xMin.toString(), padL, H - 4);
    ctx.textAlign = "right";
    ctx.fillText(xMax.toString(), W - padR, H - 4);

    // Series
    yKeys.forEach((k, i) => {
      ctx.strokeStyle = COLORS[i % COLORS.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((p, idx) => {
        const x = px(Number(p[xKey]) || 0);
        const y = py(Number(p[k]) || 0);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Legend
    ctx.font = "10px Inter,system-ui";
    let lx = padL;
    yKeys.forEach((k, i) => {
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.beginPath();
      ctx.arc(lx + 4, padT + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(232,232,237,0.85)";
      ctx.fillText(k, lx + 12, padT + 8);
      lx += ctx.measureText(k).width + 24;
    });
  }, [data, xKey, yKeys]);

  return <canvas ref={ref} className="h-44 w-full" />;
}
