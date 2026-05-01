"use client";

import { Coins } from "lucide-react";

export function CostTicker() {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-xs text-ink-2">
      <Coins className="h-3 w-3 text-ink-3" />
      <span className="font-mono tabular-nums">$0.00</span>
      <span className="text-ink-3">today</span>
    </div>
  );
}
