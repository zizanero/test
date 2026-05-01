import { prisma } from "@/server/db";
import { complete } from "./llm";
import { embed } from "./embeddings";
import { recentImportanceSum, retrieve } from "./memory";

const REFLECTION_THRESHOLD = 150;
const REFLECTION_WINDOW = 50;

export interface ReflectionRow {
  id: string;
  insight: string;
  evidenceMemoryIds: string[];
  parentReflectionId: string | null;
  importance: number;
}

export async function shouldReflect(
  agentId: string,
  runId: string,
  tick: number,
): Promise<boolean> {
  if (tick < 5) return false;
  const sum = await recentImportanceSum(
    agentId,
    runId,
    Math.max(0, tick - REFLECTION_WINDOW),
    tick,
  );
  // Also require we haven't reflected too recently.
  const recentReflection = await prisma.reflection.findFirst({
    where: { agentId, runId, tick: { gte: tick - 10 } },
  });
  if (recentReflection) return false;
  return sum >= REFLECTION_THRESHOLD;
}

export async function generateReflection(args: {
  runId: string;
  agentId: string;
  tick: number;
  agentName: string;
  proseIdentity: string;
}): Promise<ReflectionRow[]> {
  // Gather top recent memories with importance ≥ 4 (Park's rule).
  const recent = await prisma.memory.findMany({
    where: {
      agentId: args.agentId,
      runId: args.runId,
      tick: { gte: Math.max(0, args.tick - REFLECTION_WINDOW), lte: args.tick },
      importance: { gte: 4 },
    },
    orderBy: { importance: "desc" },
    take: 25,
  });
  if (recent.length === 0) return [];

  const memoriesBlock = recent
    .map((m) => `[${m.id}] (importance ${m.importance.toFixed(0)}): ${m.content}`)
    .join("\n");

  const out = await complete({
    kind: "reflection",
    modelTier: "reflection",
    seed: args.tick,
    temperature: 0.4,
    system: `You are ${args.agentName}. Identity:\n${args.proseIdentity}\n\nGiven recent memories, write 3 high-level insights. Each insight should cite 2-3 memory IDs. Return JSON: {"insights":[{"insight":"...","evidenceMemoryIds":["...","..."],"importance":7},...]}.`,
    user: `Memories from your recent life:\n${memoriesBlock}\n\nWhat do you notice? Return JSON only.`,
  });

  const parsed = safeJson(out.text);
  if (!parsed?.insights) return [];

  // Resolve possible parent reflection: pick top earlier reflection by retrieval relevance.
  const created: ReflectionRow[] = [];
  for (const ins of parsed.insights.slice(0, 5)) {
    if (typeof ins?.insight !== "string") continue;
    const evidence = Array.isArray(ins.evidenceMemoryIds)
      ? ins.evidenceMemoryIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // Find a parent reflection (most relevant earlier reflection).
    let parentReflectionId: string | null = null;
    const earlier = await prisma.reflection.findMany({
      where: { agentId: args.agentId, runId: args.runId, tick: { lt: args.tick } },
      orderBy: { tick: "desc" },
      take: 20,
    });
    if (earlier.length > 0) {
      const qEmb = embed(ins.insight);
      let best = earlier[0];
      let bestScore = -Infinity;
      for (const e of earlier) {
        const eEmb = embed(e.insight);
        let s = 0;
        for (let i = 0; i < qEmb.length; i++) s += qEmb[i] * eEmb[i];
        if (s > bestScore) {
          bestScore = s;
          best = e;
        }
      }
      if (bestScore > 0.3) parentReflectionId = best.id;
    }

    const row = await prisma.reflection.create({
      data: {
        runId: args.runId,
        agentId: args.agentId,
        tick: args.tick,
        insight: ins.insight,
        evidenceMemoryIds: JSON.stringify(evidence),
        parentReflectionId,
        importance: clamp(typeof ins.importance === "number" ? ins.importance : 6, 1, 10),
      },
    });

    // Also write the reflection back into the memory store (as Park does), so future
    // retrieval can surface insights, not just observations.
    await prisma.memory.create({
      data: {
        runId: args.runId,
        agentId: args.agentId,
        tick: args.tick,
        kind: "reflection",
        content: ins.insight,
        importance: row.importance,
        embedding: JSON.stringify(embed(ins.insight)),
        parentIds: JSON.stringify(evidence),
      },
    });

    created.push({
      id: row.id,
      insight: row.insight,
      evidenceMemoryIds: evidence,
      parentReflectionId,
      importance: row.importance,
    });
  }
  return created;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function safeJson(s: string): { insights?: { insight: string; evidenceMemoryIds: string[]; importance: number }[] } | null {
  try {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
