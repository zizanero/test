import type { RunContext } from "./types";

// Compute observations each agent perceives this tick:
//   - agents co-located here
//   - location-typed events ("ambient buzz", "news on the feed")
// Returns map agentId -> observation strings.
export function computeObservations(ctx: RunContext): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const a of ctx.agents) result.set(a.id, []);

  for (const [locId, agentIds] of ctx.occupancy) {
    if (agentIds.length === 0) continue;
    const loc = ctx.locations.find((l) => l.id === locId);
    const locName = loc?.name ?? "an unknown place";
    if (agentIds.length > 1) {
      const names = agentIds.map(
        (id) => ctx.agents.find((a) => a.id === id)?.displayName ?? id,
      );
      for (const id of agentIds) {
        const others = names.filter(
          (n) => n !== ctx.agents.find((a) => a.id === id)?.displayName,
        );
        if (others.length > 0)
          result
            .get(id)!
            .push(`At ${locName}, I see ${others.slice(0, 4).join(", ")}.`);
      }
    }
  }

  // Ambient topics → light-touch observations.
  for (const [topic, level] of Object.entries(ctx.ambient)) {
    if (Math.abs(level) < 0.2) continue;
    const phrase =
      level > 0
        ? `Word about "${topic}" is in the air.`
        : `There is push-back against "${topic}" today.`;
    for (const a of ctx.agents) {
      // Only some agents notice — extraversion-weighted.
      const noticed = a.personality[2] > 0.2 || Math.abs(level) > 0.5;
      if (noticed) result.get(a.id)!.push(phrase);
    }
  }

  // Pending observations (e.g. injected by Rules / GM).
  for (const [id, obs] of ctx.pendingObservations) {
    const arr = result.get(id) ?? [];
    arr.push(...obs);
    result.set(id, arr);
  }
  ctx.pendingObservations.clear();

  return result;
}
