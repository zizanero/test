"use client";

import { useObserverStore } from "@/store/observerStore";
import { Sparkles, Bookmark, Pin, AlertTriangle, GitBranch } from "lucide-react";

const TRACK_HEIGHT = 96;

export function Timeline({
  runId,
  totalTicks,
}: {
  runId: string;
  totalTicks: number;
}) {
  const currentTick = useObserverStore((s) => s.currentTick);
  const recordedTotal = useObserverStore((s) => s.totalTicks);
  const markers = useObserverStore((s) => s.markers);
  const setTick = useObserverStore((s) => s.setTick);

  const total = Math.max(totalTicks, recordedTotal, 1);

  return (
    <div
      className="col-span-1 border-t border-bg-3 bg-bg-1"
      style={{ height: TRACK_HEIGHT }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 py-1 text-2xs uppercase tracking-wider text-ink-3">
          <span>Timeline</span>
          <span className="font-mono tabular-nums">
            recorded {recordedTotal} / {total}
          </span>
        </div>
        <div className="relative flex-1 px-2 pb-2">
          <Track total={total} currentTick={currentTick} setTick={setTick} markers={markers} />
        </div>
      </div>
    </div>
  );
}

function Track({
  total,
  currentTick,
  setTick,
  markers,
}: {
  total: number;
  currentTick: number;
  setTick: (t: number) => void;
  markers: { tick: number; kind: string; label: string }[];
}) {
  return (
    <div
      className="relative h-full w-full cursor-pointer rounded-md border border-bg-3 bg-bg-2"
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        setTick(Math.round(pct * (total - 1)));
      }}
    >
      {/* Markers */}
      {markers.map((m, i) => (
        <div
          key={i}
          title={`tick ${m.tick} · ${m.kind}: ${m.label}`}
          className="absolute top-1 -translate-x-1/2 rounded-sm bg-bg-3 p-0.5"
          style={{ left: `${(m.tick / Math.max(total - 1, 1)) * 100}%` }}
        >
          {markerIcon(m.kind)}
        </div>
      ))}

      {/* Playhead */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent"
        style={{ left: `${(currentTick / Math.max(total - 1, 1)) * 100}%` }}
      >
        <div className="absolute -top-1 -left-[3px] h-2 w-2 rotate-45 bg-accent" />
      </div>
    </div>
  );
}

function markerIcon(kind: string) {
  const cls = "h-3 w-3";
  if (kind === "emergence") return <Sparkles className={`${cls} text-info`} />;
  if (kind === "reflection") return <Pin className={`${cls} text-ai`} />;
  if (kind === "anomaly") return <AlertTriangle className={`${cls} text-warn`} />;
  if (kind === "intervention") return <GitBranch className={`${cls} text-accent`} />;
  return <Bookmark className={`${cls} text-ink-2`} />;
}
