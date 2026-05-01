import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { priceCall } from "@/sim/llm/pricing";
import { env } from "@/lib/env";

// Naive projection: based on agent count × totalTicks × per-call estimate.
// Designed to match the spec's intent (a band, not a point estimate).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { simulation: { include: { populations: { include: { agentClasses: true } } } } },
  });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const agentCount = run.simulation.populations.reduce(
    (sum, p) => sum + p.agentClasses.reduce((s, c) => s + c.count, 0),
    0,
  );
  const ticks = Math.max(0, run.totalTicks - run.currentTick);
  // Per-decision: ~700 input tokens + ~200 output tokens (rough averages).
  // Reflection occurs ~1 per agent per 50 ticks.
  const decisions = ticks * agentCount;
  const reflections = Math.ceil(ticks / 50) * agentCount;
  const decisionCost = priceCall(env.LLM_MODEL_ROUTINE, 700, 200) * decisions;
  const reflCost = priceCall(env.LLM_MODEL_REFLECTION, 1500, 400) * reflections;
  const narration = priceCall(env.LLM_MODEL_GAMEMASTER, 500, 80) * ticks;
  const mid = decisionCost + reflCost + narration;
  const low = mid * 0.5;
  const high = mid * 2;
  return NextResponse.json({
    low: round(low),
    mid: round(mid),
    high: round(high),
    deterministic: env.SIM_DETERMINISTIC,
    mode: env.resolvedLlmMode,
  });
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
