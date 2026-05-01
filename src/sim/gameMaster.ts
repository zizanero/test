import type { RunContext } from "./types";
import { complete } from "./llm";
import { renderNarrationPrompt, NARRATION_PROMPT_VERSION } from "./llm/prompts";

// Concordia-style game master:
//   - arbitrate conflicts (capacity)
//   - narrate the tick (configurable verbosity)
//   - update GM-owned world state (ambient topic decay)
export async function arbitrate(
  ctx: RunContext,
  verbosity: "terse" | "narrative" | "cinematic" = "terse",
): Promise<{ narration: string; markers: { kind: string; label: string }[] }> {
  const markers: { kind: string; label: string }[] = [];

  for (const loc of ctx.locations) {
    if (loc.capacity && (ctx.occupancy.get(loc.id)?.length ?? 0) > loc.capacity) {
      const arr = ctx.occupancy.get(loc.id) ?? [];
      const allowed = arr.slice(0, loc.capacity);
      const evicted = arr.slice(loc.capacity);
      ctx.occupancy.set(loc.id, allowed);
      for (const id of evicted) {
        const a = ctx.agents.find((x) => x.id === id);
        if (a) a.currentLocationId = null;
      }
      markers.push({
        kind: "anomaly",
        label: `${loc.name} over capacity; ${evicted.length} relocated`,
      });
    }
  }

  for (const k of Object.keys(ctx.ambient)) {
    ctx.ambient[k] = clamp(ctx.ambient[k] * 0.95, -1, 1);
    if (Math.abs(ctx.ambient[k]) < 0.01) delete ctx.ambient[k];
  }

  const summary = summariseTick(ctx);
  const prompt = renderNarrationPrompt({
    tick: ctx.tick,
    summary,
    verbosity,
  });
  const out = await complete({
    kind: "narration",
    modelTier: "gameMaster",
    promptName: prompt.promptName,
    promptVersion: prompt.promptVersion,
    seed: ctx.tick ^ ctx.seed,
    temperature: 0.4,
    system: prompt.system,
    user: prompt.user,
  });

  return { narration: out.text.trim().split("\n")[0] || summary, markers };
}

function summariseTick(ctx: RunContext): string {
  const counts: Record<string, number> = {};
  for (const [, dec] of ctx.lastDecisions) {
    counts[dec.action.kind] = (counts[dec.action.kind] ?? 0) + 1;
  }
  const parts = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => `${n} ${k}`);
  if (parts.length === 0) return "agents continue routines";
  return parts.slice(0, 4).join(", ");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export { NARRATION_PROMPT_VERSION };
