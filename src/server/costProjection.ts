import { prisma } from "@/server/db";
import { priceCall } from "@/sim/llm/pricing";
import { env } from "@/lib/env";

// Pre-flight cost projection band.
//
// Strategy: if at least 5 ticks of *similar* runs exist for this simulation,
// extrapolate from observed token usage. Otherwise fall back to a heuristic.
// (Per spec §9 — pre-estimation requires running a small sample to anchor.)

export interface ProjectionBand {
  low: number;
  mid: number;
  high: number;
  mode: "anthropic" | "mock";
  basis: "from_observed_run" | "heuristic";
  observedRunId?: string;
  observedTicks?: number;
}

export async function projectCost(runId: string): Promise<ProjectionBand> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      simulation: {
        include: {
          populations: { include: { agentClasses: true } },
          runs: {
            where: { status: { in: ["completed", "running", "paused"] } },
            select: { id: true, currentTick: true },
            orderBy: { startedAt: "desc" },
            take: 8,
          },
        },
      },
    },
  });
  if (!run) throw new Error("run not found");

  const agentCount = run.simulation.populations.reduce(
    (sum, p) => sum + p.agentClasses.reduce((s, c) => s + c.count, 0),
    0,
  );
  const remainingTicks = Math.max(0, run.totalTicks - run.currentTick);

  // Look for a sibling run with at least 5 ticks recorded — that's the probe.
  const probe = run.simulation.runs.find((r) => r.currentTick >= 5);
  if (probe) {
    const window = await prisma.costLedger.findMany({
      where: { runId: probe.id, tick: { lte: probe.currentTick - 1 } },
      take: 5000,
    });
    if (window.length > 0) {
      const tokensInPerCall = average(window.map((w) => w.tokensIn));
      const tokensOutPerCall = average(window.map((w) => w.tokensOut));
      const callsPerTickPerAgent = window.length / Math.max(1, probe.currentTick * agentCount);
      const ticksToCost = (model: string) =>
        priceCall(model, tokensInPerCall, tokensOutPerCall) *
        callsPerTickPerAgent *
        agentCount *
        remainingTicks;
      // Use the active routing tiers.
      const mid =
        ticksToCost(env.LLM_MODEL_ROUTINE) * 0.85 +
        ticksToCost(env.LLM_MODEL_REFLECTION) * 0.1 +
        ticksToCost(env.LLM_MODEL_GAMEMASTER) * 0.05;
      return {
        low: round(mid * 0.6),
        mid: round(mid),
        high: round(mid * 1.6),
        mode: env.resolvedLlmMode,
        basis: "from_observed_run",
        observedRunId: probe.id,
        observedTicks: probe.currentTick,
      };
    }
  }

  // Heuristic fallback (the original logic).
  const decisions = remainingTicks * agentCount;
  const reflections = Math.ceil(remainingTicks / 50) * agentCount;
  const decisionCost = priceCall(env.LLM_MODEL_ROUTINE, 700, 200) * decisions;
  const reflCost = priceCall(env.LLM_MODEL_REFLECTION, 1500, 400) * reflections;
  const narration = priceCall(env.LLM_MODEL_GAMEMASTER, 500, 80) * remainingTicks;
  const mid = decisionCost + reflCost + narration;
  return {
    low: round(mid * 0.5),
    mid: round(mid),
    high: round(mid * 2),
    mode: env.resolvedLlmMode,
    basis: "heuristic",
  };
}

function average(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
