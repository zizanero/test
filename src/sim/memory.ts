import { prisma } from "@/server/db";
import { embed, cosine } from "./embeddings";
import { complete } from "./llm";
import type { MemoryRow } from "./types";
import {
  renderImportancePrompt,
  IMPORTANCE_PROMPT_VERSION,
} from "./llm/prompts";
import { ImportanceSchema, extractJson } from "./llm/parser";

const RECENCY_HALF_LIFE_TICKS = 24;
const IMPORTANCE_DEFAULT = 5;

export interface RetrieveOpts {
  k?: number;
  weights?: { recency?: number; importance?: number; relevance?: number };
}

export async function ingestObservation(args: {
  runId: string;
  agentId: string;
  tick: number;
  content: string;
  importance?: number;
  parentIds?: string[];
  kind?: "observation" | "reflection" | "dialogue" | "plan";
}): Promise<MemoryRow> {
  const importance =
    args.importance !== undefined
      ? args.importance
      : await gradeImportance(args.content, { runId: args.runId, tick: args.tick });
  const embedding = embed(args.content);
  const created = await prisma.memory.create({
    data: {
      runId: args.runId,
      agentId: args.agentId,
      tick: args.tick,
      kind: args.kind ?? "observation",
      content: args.content,
      importance,
      embedding: JSON.stringify(embedding),
      parentIds: args.parentIds ? JSON.stringify(args.parentIds) : null,
    },
  });
  return rowToMemoryRow(created);
}

async function gradeImportance(
  content: string,
  ctx: { runId: string; tick: number },
): Promise<number> {
  if (content.length < 24) return 2;
  try {
    const prompt = renderImportancePrompt(content);
    const out = await complete({
      kind: "importance_grade",
      modelTier: "routine",
      promptName: prompt.promptName,
      promptVersion: prompt.promptVersion,
      system: prompt.system,
      user: prompt.user,
      seed: ctx.tick,
      temperature: 0,
    });
    const json = extractJson(out.text);
    const parsed = json !== null ? ImportanceSchema.safeParse(json) : null;
    if (parsed?.success) return clamp(parsed.data.importance, 1, 10);
  } catch {
    // fall through
  }
  return IMPORTANCE_DEFAULT;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function retrieve(
  agentId: string,
  query: string,
  ctx: { runId: string; tick: number },
  opts: RetrieveOpts = {},
): Promise<MemoryRow[]> {
  const k = opts.k ?? 5;
  const w = {
    recency: opts.weights?.recency ?? 1,
    importance: opts.weights?.importance ?? 1,
    relevance: opts.weights?.relevance ?? 1,
  };
  const memories = await prisma.memory.findMany({
    where: { agentId, runId: ctx.runId, tick: { lte: ctx.tick } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (memories.length === 0) return [];
  const qEmb = embed(query);
  const scored = memories.map((m) => {
    const ageTicks = Math.max(0, ctx.tick - m.tick);
    const recency = Math.pow(0.5, ageTicks / RECENCY_HALF_LIFE_TICKS);
    const importance01 = clamp(m.importance / 10, 0, 1);
    const emb = JSON.parse(m.embedding) as number[];
    const relevance = clamp((cosine(qEmb, emb) + 1) / 2, 0, 1);
    const score =
      w.recency * recency + w.importance * importance01 + w.relevance * relevance;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, k);

  const ids = top.map(({ m }) => m.id);
  await prisma.memory.updateMany({
    where: { id: { in: ids } },
    data: { lastRetrievedTick: ctx.tick, retrievalCount: { increment: 1 } },
  });

  return top.map(({ m }) => rowToMemoryRow(m));
}

function rowToMemoryRow(m: {
  id: string;
  agentId: string;
  tick: number;
  kind: string;
  content: string;
  importance: number;
  embedding: string;
  retrievalCount: number;
  lastRetrievedTick: number | null;
  parentIds: string | null;
}): MemoryRow {
  return {
    id: m.id,
    agentId: m.agentId,
    tick: m.tick,
    kind: m.kind as MemoryRow["kind"],
    content: m.content,
    importance: m.importance,
    embedding: JSON.parse(m.embedding),
    retrievalCount: m.retrievalCount,
    lastRetrievedTick: m.lastRetrievedTick,
    parentIds: m.parentIds ? (JSON.parse(m.parentIds) as string[]) : undefined,
  };
}

export async function recentImportanceSum(
  agentId: string,
  runId: string,
  fromTick: number,
  toTick: number,
): Promise<number> {
  const memories = await prisma.memory.findMany({
    where: { agentId, runId, tick: { gte: fromTick, lte: toTick }, kind: "observation" },
    select: { importance: true },
  });
  return memories.reduce((s, m) => s + m.importance, 0);
}

export { IMPORTANCE_PROMPT_VERSION };
