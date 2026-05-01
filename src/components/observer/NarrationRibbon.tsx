"use client";

import { useObserverStore } from "@/store/observerStore";
import { Sparkles } from "lucide-react";

export function NarrationRibbon() {
  const narrationByTick = useObserverStore((s) => s.narrationByTick);
  const currentTick = useObserverStore((s) => s.currentTick);

  // Show last 4 narration entries up to currentTick
  const ticks = Array.from(narrationByTick.keys())
    .filter((t) => t <= currentTick)
    .sort((a, b) => b - a)
    .slice(0, 4);

  return (
    <div className="col-span-2 flex h-9 items-center gap-2 overflow-hidden border-b border-bg-3 bg-bg-1 px-3">
      <Sparkles className="h-3 w-3 shrink-0 text-ai" />
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        {ticks.length === 0 ? (
          <span className="text-2xs text-ink-3">
            Narration ribbon — events will appear as the simulation runs.
          </span>
        ) : (
          ticks.map((t, i) => (
            <span
              key={t}
              className={`truncate text-xs ${
                i === 0 ? "text-ink-1" : "text-ink-3"
              }`}
            >
              <span className="mr-1 rounded bg-bg-3 px-1 py-0.5 font-mono text-2xs text-ink-2">
                T={t}
              </span>
              {narrationByTick.get(t)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
