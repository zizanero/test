import { prisma } from "@/server/db";
import type { DecisionResult, RunContext } from "./types";

// Update agent relationship weights based on co-location, speaking, etc.
// Cheap and bounded: only updates affected pairs each tick.
export async function updateRelationships(
  agentId: string,
  decision: DecisionResult,
  ctx: RunContext,
): Promise<void> {
  if (decision.action.kind !== "speak") return;
  const peerId = String(decision.action.params.peerId ?? "");
  if (!peerId) return;
  await upsertEdge(ctx.runId, agentId, peerId, 0.05, ctx.tick);
  await upsertEdge(ctx.runId, peerId, agentId, 0.03, ctx.tick);
}

async function upsertEdge(
  runId: string,
  from: string,
  to: string,
  delta: number,
  tick: number,
): Promise<void> {
  const existing = await prisma.relationship.findUnique({
    where: { runId_fromAgentId_toAgentId: { runId, fromAgentId: from, toAgentId: to } },
  });
  if (existing) {
    const w = Math.max(-1, Math.min(1, existing.weight + delta));
    await prisma.relationship.update({
      where: { id: existing.id },
      data: { weight: w, lastUpdatedTick: tick },
    });
  } else {
    await prisma.relationship.create({
      data: {
        runId,
        fromAgentId: from,
        toAgentId: to,
        weight: delta,
        kind: "acquaintance",
        lastUpdatedTick: tick,
      },
    });
  }
}
