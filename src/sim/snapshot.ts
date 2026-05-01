import type { RunContext } from "./types";

// Compact per-tick snapshot stored as JSON in Tick.snapshot.
// Sufficient to (1) restore the canvas at any tick and (2) resume the loop.
export interface TickSnapshot {
  agents: {
    id: string;
    locationId: string | null;
    goal: string | null;
    beliefs: Record<string, number>;
  }[];
  ambient: Record<string, number>;
}

export function snapshot(ctx: RunContext): TickSnapshot {
  return {
    agents: ctx.agents.map((a) => ({
      id: a.id,
      locationId: a.currentLocationId,
      goal: a.goal,
      beliefs: { ...a.beliefs },
    })),
    ambient: { ...ctx.ambient },
  };
}
