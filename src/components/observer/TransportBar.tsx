"use client";

import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Pause,
  Play,
  SkipForward,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useObserverStore } from "@/store/observerStore";

export function TransportBar({
  runId,
  totalTicks,
}: {
  runId: string;
  totalTicks: number;
}) {
  const isPlaying = useObserverStore((s) => s.isPlaying);
  const speed = useObserverStore((s) => s.speed);
  const currentTick = useObserverStore((s) => s.currentTick);
  const status = useObserverStore((s) => s.status);
  const setIsPlaying = useObserverStore((s) => s.setIsPlaying);
  const setSpeed = useObserverStore((s) => s.setSpeed);
  const setTick = useObserverStore((s) => s.setTick);

  useHotkeys("space", () => setIsPlaying(!isPlaying), [isPlaying]);
  useHotkeys(",", () => setTick(Math.max(0, currentTick - 1)), [currentTick]);
  useHotkeys(".", () => setTick(Math.min(totalTicks - 1, currentTick + 1)), [currentTick, totalTicks]);
  useHotkeys("k", () => setIsPlaying(!isPlaying), [isPlaying]);

  async function pauseRun() {
    setIsPlaying(false);
    await fetch(`/api/runs/${runId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
  }
  async function resumeRun() {
    setIsPlaying(true);
    await fetch(`/api/runs/${runId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
  }

  return (
    <div className="flex h-10 items-center justify-between border-b border-bg-3 bg-bg-1 px-3">
      <div className="flex items-center gap-1">
        <Btn onClick={() => setTick(0)} title="Restart">
          <RotateCcw className="h-3.5 w-3.5" />
        </Btn>
        <Btn onClick={() => setTick(Math.max(0, currentTick - 1))} title="Step back (,)">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Btn>
        <Btn
          onClick={() => (status === "paused" ? resumeRun() : pauseRun())}
          title={status === "paused" ? "Resume" : "Pause"}
          accent
        >
          {status === "paused" ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
        </Btn>
        <Btn
          onClick={() => setTick(Math.min(totalTicks - 1, currentTick + 1))}
          title="Step (.)"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Btn>
        <Btn onClick={() => setTick(totalTicks - 1)} title="Skip to end">
          <SkipForward className="h-3.5 w-3.5" />
        </Btn>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1 rounded-md border border-bg-3 bg-bg-2 px-1.5 py-0.5">
          {[0.25, 1, 4, 16, 64].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s as 0.25 | 1 | 4 | 16 | 64)}
              className={`rounded px-1 text-2xs ${
                speed === s ? "bg-accent text-accent-fg" : "text-ink-2 hover:text-ink-1"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <span className="font-mono text-ink-2 tabular-nums">
          tick {currentTick} / {totalTicks}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-2xs uppercase ${
            status === "running"
              ? "bg-info/20 text-info"
              : status === "completed"
                ? "bg-success/20 text-success"
                : "bg-bg-3 text-ink-2"
          }`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

function Btn({
  onClick,
  children,
  title,
  accent,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-ink-1 transition-colors ${
        accent ? "bg-accent/15 hover:bg-accent/25 text-accent-fg" : "hover:bg-bg-2"
      }`}
    >
      {children}
    </button>
  );
}
