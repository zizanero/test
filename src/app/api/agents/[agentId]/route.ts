import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      class: { select: { name: true } },
      currentLocation: { select: { name: true } },
    },
  });
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [memories, decisions, reflections, relationshipsOut] = await Promise.all([
    prisma.memory.findMany({
      where: { agentId },
      orderBy: [{ tick: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    prisma.decision.findMany({
      where: { agentId },
      orderBy: [{ tick: "desc" }],
      take: 12,
    }),
    prisma.reflection.findMany({
      where: { agentId },
      orderBy: [{ tick: "desc" }],
      take: 20,
    }),
    prisma.relationship.findMany({
      where: { fromAgentId: agentId },
      orderBy: { weight: "desc" },
      take: 8,
    }),
  ]);

  // Hydrate peer display names for relationships.
  const peerIds = relationshipsOut.map((r) => r.toAgentId);
  const peers = await prisma.agent.findMany({
    where: { id: { in: peerIds } },
    select: { id: true, displayName: true },
  });

  return NextResponse.json({
    agent: {
      id: agent.id,
      displayName: agent.displayName,
      proseIdentity: agent.proseIdentity,
      className: agent.class.name,
      currentLocationName: agent.currentLocation?.name ?? null,
      goal: agent.goal,
      status: agent.status,
      beliefs: safeParse(agent.beliefs),
    },
    memories: memories.map((m) => ({
      id: m.id,
      tick: m.tick,
      kind: m.kind,
      content: m.content,
      importance: m.importance,
      retrievalCount: m.retrievalCount,
      lastRetrievedTick: m.lastRetrievedTick,
      parentIds: m.parentIds ? (JSON.parse(m.parentIds) as string[]) : null,
    })),
    decisions: decisions.map((d) => ({
      id: d.id,
      tick: d.tick,
      reasoning: d.reasoning,
      reasoningSummary: d.reasoningSummary,
      retrievedMemoryIds: JSON.parse(d.retrievedMemoryIds) as string[],
      action: JSON.parse(d.action),
      modelName: d.modelName,
      modelTier: d.modelTier,
      tokensIn: d.tokensIn,
      tokensOut: d.tokensOut,
      costUsd: d.costUsd,
      cached: d.cached,
    })),
    reflections: reflections.map((r) => ({
      id: r.id,
      tick: r.tick,
      insight: r.insight,
      evidenceMemoryIds: JSON.parse(r.evidenceMemoryIds) as string[],
      parentReflectionId: r.parentReflectionId,
      importance: r.importance,
    })),
    relationships: relationshipsOut.map((r) => ({
      toAgentId: r.toAgentId,
      toName: peers.find((p) => p.id === r.toAgentId)?.displayName ?? r.toAgentId,
      weight: r.weight,
      kind: r.kind,
      lastUpdatedTick: r.lastUpdatedTick,
    })),
  });
}

function safeParse(s: string): Record<string, number> {
  try {
    return JSON.parse(s) as Record<string, number>;
  } catch {
    return {};
  }
}
