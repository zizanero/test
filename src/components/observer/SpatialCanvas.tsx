"use client";

import { useEffect, useRef } from "react";
import { useObserverStore } from "@/store/observerStore";

interface Location {
  id: string;
  name: string;
  x: number;
  y: number;
  capacity: number | null;
  kind: string;
}

interface World {
  width: number;
  height: number;
  locations: Location[];
}

const PADDING = 24;
const AGENT_RADIUS = 4;
const LOCATION_RADIUS = 22;

export function SpatialCanvas({ world }: { world: World }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTick = useObserverStore((s) => s.currentTick);
  const agentsByTick = useObserverStore((s) => s.agentsByTick);
  const selectedAgentId = useObserverStore((s) => s.selectedAgentId);
  const pinnedAgentIds = useObserverStore((s) => s.pinnedAgentIds);
  const selectAgent = useObserverStore((s) => s.selectAgent);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    });
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTick, agentsByTick, selectedAgentId, pinnedAgentIds, world]);

  function project(x: number, y: number, w: number, h: number) {
    const xRange = world.width;
    const yRange = world.height;
    const gx = ((x / xRange) * (w - 2 * PADDING)) + PADDING;
    const gy = ((y / yRange) * (h - 2 * PADDING)) + PADDING;
    return { gx, gy };
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const grid = 8;
    for (let i = 0; i <= grid; i++) {
      const x = PADDING + (i / grid) * (w - 2 * PADDING);
      ctx.beginPath();
      ctx.moveTo(x, PADDING);
      ctx.lineTo(x, h - PADDING);
      ctx.stroke();
      const y = PADDING + (i / grid) * (h - 2 * PADDING);
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(w - PADDING, y);
      ctx.stroke();
    }

    // Locations
    for (const loc of world.locations) {
      const { gx, gy } = project(loc.x, loc.y, w, h);
      ctx.beginPath();
      ctx.arc(gx, gy, LOCATION_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(31,122,140,0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(31,122,140,0.45)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "rgba(232,232,237,0.85)";
      ctx.font = "11px Inter,system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(loc.name, gx, gy + LOCATION_RADIUS + 12);
    }

    // Agents at the current tick
    const agents = agentsByTick.get(currentTick) ?? [];
    // Cluster agents at same location
    const clusters = new Map<string, typeof agents>();
    for (const a of agents) {
      const k = a.locationId ?? "_unplaced";
      const arr = clusters.get(k) ?? [];
      arr.push(a);
      clusters.set(k, arr);
    }
    for (const [locId, group] of clusters) {
      const loc = world.locations.find((l) => l.id === locId);
      const center = loc ? project(loc.x, loc.y, w, h) : { gx: w / 2, gy: h / 2 };
      group.forEach((a, i) => {
        const angle = (i / Math.max(group.length, 1)) * Math.PI * 2;
        const r = LOCATION_RADIUS - 6;
        const cx = center.gx + Math.cos(angle) * r * (group.length > 1 ? 1 : 0);
        const cy = center.gy + Math.sin(angle) * r * (group.length > 1 ? 1 : 0);
        const isSelected = a.id === selectedAgentId;
        const isPinned = pinnedAgentIds.includes(a.id);
        ctx.beginPath();
        ctx.arc(cx, cy, isSelected ? AGENT_RADIUS + 1.5 : AGENT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? "#1f7a8c"
          : isPinned
            ? "#fbbf24"
            : "rgba(232,232,237,0.78)";
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = "#e6f6fb";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const agents = agentsByTick.get(currentTick) ?? [];
    let best: { id: string; d: number } | null = null;
    for (const a of agents) {
      const loc = world.locations.find((l) => l.id === a.locationId);
      if (!loc) continue;
      const center = project(loc.x, loc.y, w, h);
      const dx = center.gx - cx;
      const dy = center.gy - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!best || d < best.d) best = { id: a.id, d };
    }
    if (best && best.d < LOCATION_RADIUS + 8) selectAgent(best.id);
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        onClick={onClick}
        className="cursor-crosshair"
        style={{ display: "block" }}
      />
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-bg-3 bg-bg-1/80 px-2 py-1 text-2xs font-mono tabular-nums text-ink-2 backdrop-blur">
        tick {currentTick}
      </div>
    </div>
  );
}
