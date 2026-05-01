import { prisma } from "@/server/db";
import { ksDistance, wasserstein1 } from "@/lib/ksDistance";

// Per-stratum sub-population fit panel. Strata are AgentClasses by default;
// the metric is per-agent decision count over the run. Computed as KS / W1
// vs the overall population distribution to flag systematic deviations.

export interface EquityRow {
  stratum: string;
  n: number;
  mean: number;
  ksVsOverall: number;
  wassersteinVsOverall: number;
  flag: "ok" | "warn" | "bad";
}

export interface EquityReport {
  metric: string;
  overallN: number;
  rows: EquityRow[];
}

export async function computeEquity(runId: string): Promise<EquityReport> {
  const agents = await prisma.agent.findMany({
    where: { runId },
    include: { class: { select: { name: true } } },
  });

  // Decision-count per agent — the cheapest activity proxy.
  const counts = await prisma.decision.groupBy({
    by: ["agentId"],
    where: { runId },
    _count: { _all: true },
  });
  const decisionByAgent = new Map<string, number>();
  for (const r of counts) decisionByAgent.set(r.agentId, r._count._all);

  const overall = agents.map((a) => decisionByAgent.get(a.id) ?? 0);

  // Group by class.
  const byStratum = new Map<string, number[]>();
  for (const a of agents) {
    const k = a.class.name;
    const arr = byStratum.get(k) ?? [];
    arr.push(decisionByAgent.get(a.id) ?? 0);
    byStratum.set(k, arr);
  }

  const rows: EquityRow[] = [];
  for (const [stratum, samples] of byStratum) {
    if (samples.length === 0) continue;
    const ks = ksDistance(samples, overall);
    const w1 = wasserstein1(samples, overall);
    const flag: EquityRow["flag"] = ks < 0.15 ? "ok" : ks < 0.3 ? "warn" : "bad";
    rows.push({
      stratum,
      n: samples.length,
      mean: samples.reduce((s, x) => s + x, 0) / samples.length,
      ksVsOverall: ks,
      wassersteinVsOverall: Number.isFinite(w1) ? w1 : 0,
      flag,
    });
  }

  rows.sort((a, b) => b.ksVsOverall - a.ksVsOverall);

  return {
    metric: "decisions_per_agent",
    overallN: overall.length,
    rows,
  };
}
