// Approximate Bayesian Computation for retrieval-weight tuning.
//
// Strategy (closed-form, no engine re-runs needed):
//   1. Take an existing run's memory store (the "world").
//   2. Define a parameter space: { recencyW, importanceW, relevanceW }.
//   3. Sample N parameter sets from a uniform prior.
//   4. For each sample, compute a *retrieval-importance distribution* by
//      scoring all memories with those weights and taking the top-k per agent.
//   5. Compare its distribution to a target dataset (KS distance).
//   6. Accept samples within ε-tolerance → posterior.
//
// This avoids the cost of re-running the engine for each parameter sample, and
// still surfaces a meaningful "how should retrieval weights be tuned to fit the
// target distribution?" answer. For full engine-based ABC, swap step 4 for a
// short engine run; the rest of the pipeline is the same.

import { prisma } from "@/server/db";
import { ksDistance } from "@/lib/ksDistance";
import { mulberry32 } from "@/sim/rng";
import { cosine } from "@/sim/embeddings";

export interface AbcParameterSpace {
  recencyW: [number, number];
  importanceW: [number, number];
  relevanceW: [number, number];
}

export interface AbcSample {
  recencyW: number;
  importanceW: number;
  relevanceW: number;
  distance: number;
  accepted: boolean;
}

export interface AbcRequest {
  runId: string;
  targetDatasetSlug: string;
  numSamples?: number;
  topK?: number;
  parameterSpace?: AbcParameterSpace;
  // Acceptance: keep top X% by distance.
  acceptTopFraction?: number;
}

export interface AbcResult {
  numSamples: number;
  numAccepted: number;
  posterior: {
    recencyW: { mean: number; sd: number; q25: number; q50: number; q75: number };
    importanceW: { mean: number; sd: number; q25: number; q50: number; q75: number };
    relevanceW: { mean: number; sd: number; q25: number; q50: number; q75: number };
  };
  bestSample: AbcSample;
  samples: AbcSample[];
  targetDatasetSlug: string;
  targetMetric: string;
  basisRunId: string;
  basisMemoriesUsed: number;
}

const RECENCY_HALF_LIFE_TICKS = 24;

export async function runAbc(req: AbcRequest): Promise<AbcResult> {
  const numSamples = Math.min(80, Math.max(8, req.numSamples ?? 30));
  const topK = req.topK ?? 5;
  const acceptTopFraction = req.acceptTopFraction ?? 0.2;
  const space: AbcParameterSpace = req.parameterSpace ?? {
    recencyW: [0, 2],
    importanceW: [0, 2],
    relevanceW: [0, 2],
  };

  const dataset = await prisma.dataset.findUnique({
    where: { slug: req.targetDatasetSlug },
  });
  if (!dataset) throw new Error(`dataset not found: ${req.targetDatasetSlug}`);
  const targetSamples = parseDatasetCsv(dataset.csvData);

  const memories = await prisma.memory.findMany({
    where: { runId: req.runId },
    select: { id: true, agentId: true, tick: true, importance: true, embedding: true },
    take: 5000,
  });
  if (memories.length === 0) throw new Error("no memories in basis run");

  const runMaxTick = memories.reduce((m, x) => (x.tick > m ? x.tick : m), 0);

  // Group by agent for top-k retrieval per agent.
  const byAgent = new Map<string, typeof memories>();
  for (const m of memories) {
    const arr = byAgent.get(m.agentId) ?? [];
    arr.push(m);
    byAgent.set(m.agentId, arr);
  }

  // Pre-decode embeddings once.
  const embCache = new Map<string, number[]>();
  for (const m of memories) {
    try {
      embCache.set(m.id, JSON.parse(m.embedding) as number[]);
    } catch {
      /* skip */
    }
  }

  // Use a fixed query embedding: the average embedding across the run. That
  // gives a stable "what's salient overall" anchor.
  const avg = new Array(32).fill(0);
  let count = 0;
  for (const e of embCache.values()) {
    for (let i = 0; i < e.length && i < avg.length; i++) avg[i] += e[i];
    count++;
  }
  if (count > 0) for (let i = 0; i < avg.length; i++) avg[i] /= count;

  const seedRng = mulberry32(0xABC0DE);
  const samples: AbcSample[] = [];

  for (let s = 0; s < numSamples; s++) {
    const recencyW = lerp(space.recencyW, seedRng());
    const importanceW = lerp(space.importanceW, seedRng());
    const relevanceW = lerp(space.relevanceW, seedRng());

    // Compute retrieval-importance distribution: top-K importance values per agent.
    const importanceSamples: number[] = [];
    for (const [, group] of byAgent) {
      const scored = group.map((m) => {
        const ageTicks = Math.max(0, runMaxTick - m.tick);
        const recency = Math.pow(0.5, ageTicks / RECENCY_HALF_LIFE_TICKS);
        const importance01 = clamp01(m.importance / 10);
        const emb = embCache.get(m.id) ?? avg;
        const relevance = clamp01((cosine(avg, emb) + 1) / 2);
        const score = recencyW * recency + importanceW * importance01 + relevanceW * relevance;
        return { m, score };
      });
      scored.sort((a, b) => b.score - a.score);
      for (const x of scored.slice(0, topK)) importanceSamples.push(x.m.importance);
    }
    const distance = ksDistance(importanceSamples, targetSamples);
    samples.push({
      recencyW: round3(recencyW),
      importanceW: round3(importanceW),
      relevanceW: round3(relevanceW),
      distance: round3(distance),
      accepted: false,
    });
  }

  // Accept top fraction by distance.
  samples.sort((a, b) => a.distance - b.distance);
  const acceptCount = Math.max(1, Math.round(numSamples * acceptTopFraction));
  for (let i = 0; i < acceptCount; i++) samples[i].accepted = true;

  const acceptedSamples = samples.filter((s) => s.accepted);
  const posterior = {
    recencyW: summary(acceptedSamples.map((s) => s.recencyW)),
    importanceW: summary(acceptedSamples.map((s) => s.importanceW)),
    relevanceW: summary(acceptedSamples.map((s) => s.relevanceW)),
  };

  return {
    numSamples,
    numAccepted: acceptedSamples.length,
    posterior,
    bestSample: samples[0],
    samples,
    targetDatasetSlug: req.targetDatasetSlug,
    targetMetric: dataset.metricKey,
    basisRunId: req.runId,
    basisMemoriesUsed: memories.length,
  };
}

function parseDatasetCsv(csv: string): number[] {
  const lines = csv.split(/\r?\n/);
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && /[a-z]/i.test(lines[i])) continue; // header
    const cols = lines[i].split(",");
    const last = cols[cols.length - 1];
    const v = parseFloat(last);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function lerp(range: [number, number], u: number): number {
  return range[0] + u * (range[1] - range[0]);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function summary(xs: number[]): {
  mean: number;
  sd: number;
  q25: number;
  q50: number;
  q75: number;
} {
  if (xs.length === 0) return { mean: 0, sd: 0, q25: 0, q50: 0, q75: 0 };
  const sorted = xs.slice().sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(
    xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1),
  );
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))];
  return {
    mean: round3(mean),
    sd: round3(sd),
    q25: round3(q(0.25)),
    q50: round3(q(0.5)),
    q75: round3(q(0.75)),
  };
}
