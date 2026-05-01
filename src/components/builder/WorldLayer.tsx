"use client";

import { useEffect, useRef } from "react";

interface Loc {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  capacity: number | null;
}

export function WorldLayer({
  world,
}: {
  world: { width: number; height: number; locations: Loc[] };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => draw(), [world]);

  function draw() {
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
    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let x = 0; x <= world.width; x++) {
      ctx.beginPath();
      ctx.moveTo((x / world.width) * W, 0);
      ctx.lineTo((x / world.width) * W, H);
      ctx.stroke();
    }
    for (let y = 0; y <= world.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, (y / world.height) * H);
      ctx.lineTo(W, (y / world.height) * H);
      ctx.stroke();
    }
    for (const l of world.locations) {
      const cx = (l.x / world.width) * W;
      const cy = (l.y / world.height) * H;
      ctx.fillStyle = "rgba(31,122,140,0.12)";
      ctx.strokeStyle = "rgba(31,122,140,0.6)";
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(232,232,237,0.85)";
      ctx.font = "11px Inter,system-ui";
      ctx.textAlign = "center";
      ctx.fillText(l.name, cx, cy + 38);
    }
  }
  return (
    <div className="grid h-full grid-cols-[260px,1fr,260px]">
      <aside className="overflow-auto border-r border-bg-3 bg-bg-1 p-3">
        <h2 className="mb-2 text-2xs uppercase tracking-wider text-ink-3">
          Locations ({world.locations.length})
        </h2>
        <ul className="space-y-0.5">
          {world.locations.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-bg-2"
            >
              <span>{l.name}</span>
              <span className="text-2xs text-ink-3">
                ({l.x}, {l.y}) · {l.capacity ?? "∞"}
              </span>
            </li>
          ))}
        </ul>
      </aside>
      <section className="relative bg-bg-0 p-4">
        <canvas ref={ref} className="h-full w-full rounded-md" />
      </section>
      <aside className="overflow-auto border-l border-bg-3 bg-bg-1 p-3">
        <h3 className="text-2xs uppercase tracking-wider text-ink-3">Palette</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {["Area", "Sub-area", "Object"].map((k) => (
            <div
              key={k}
              className="rounded-md border border-dashed border-bg-3 bg-bg-2 px-2 py-3 text-center text-2xs text-ink-3"
            >
              {k}
            </div>
          ))}
        </div>
        <p className="mt-3 text-2xs text-ink-3">
          MVP: locations are read-only; wire up drag-to-place in v1.
        </p>
      </aside>
    </div>
  );
}
