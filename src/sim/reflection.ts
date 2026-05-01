import { prisma } from "@/server/db";
import { complete } from "./llm";
import { embed } from "./embeddings";
import { recentImportanceSum } from "./memory";
import {
  renderReflectionPrompt,
  REFLECTION_PROMPT_VERSION,
} from "./llm/prompts";
import { ReflectionSchema, extractJson } from "./llm/parser";

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

  const prompt = renderReflectionPrompt({
    agentName: args.agentName,
    proseIdentity: args.proseIdentity,
    memoriesBlock,
  });

  const out = await complete({
    kind: "reflection",
    modelTier: "reflection",
    promptName: prompt.promptName,
    promptVersion: prompt.promptVersion,
    seed: args.tick,
    temperature: 0.4,
    system: prompt.system,
    user: prompt.user,
  });

  const json = extractJson(out.text);
  const parsed = json !== null ? ReflectionSchema.safeParse(json) : null;
  if (!parsed?.success) return [];

  const created: ReflectionRow[] = [];
  for (const ins of parsed.data.insights.slice(0, 5)) {
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
        evidenceMemoryIds: JSON.stringify(ins.evidenceMemoryIds),
        parentReflectionId,
        importance: clamp(ins.importance, 1, 10),
      },
    });

    await prisma.memory.create({
      data: {
        runId: args.runId,
        agentId: args.agentId,
        tick: args.tick,
        kind: "reflection",
        content: ins.insight,
        importance: row.importance,
        embedding: JSON.stringify(embed(ins.insight)),
        parentIds: JSON.stringify(ins.evidenceMemoryIds),
      },
    });

    created.push({
      id: row.id,
      insight: row.insight,
      evidenceMemoryIds: ins.evidenceMemoryIds,
      parentReflectionId,
      importance: row.importance,
    });
  }
  return created;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export { REFLECTION_PROMPT_VERSION };
