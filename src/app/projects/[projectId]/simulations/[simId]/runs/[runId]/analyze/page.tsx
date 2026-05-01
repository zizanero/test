import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; simId: string; runId: string }>;
}) {
  const { projectId, simId, runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { simulation: true },
  });
  if (!run) notFound();

  const decisions = await prisma.decision.findMany({
    where: { runId },
    orderBy: [{ tick: "asc" }],
    select: { tick: true, action: true, costUsd: true, modelTier: true, agentId: true },
    take: 5000,
  });
  const memories = await prisma.memory.findMany({
    where: { runId },
    select: { tick: true, kind: true, importance: true },
    take: 5000,
  });
  const ticks = await prisma.tick.findMany({
    where: { runId },
    select: { index: true, narration: true },
    orderBy: { index: "asc" },
    take: 200,
  });

  // Sibling runs (for comparison block).
  const siblings = await prisma.run.findMany({
    where: { simulationId: simId, id: { not: runId } },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: { id: true, label: true, currentTick: true, totalTicks: true, costUsd: true, status: true },
  });

  // Per-tick action histogram for the current run.
  const actionByTick: Record<number, Record<string, number>> = {};
  for (const d of decisions) {
    const a = JSON.parse(d.action) as { kind: string };
    actionByTick[d.tick] ??= {};
    actionByTick[d.tick][a.kind] = (actionByTick[d.tick][a.kind] ?? 0) + 1;
  }
  const actionSeries = Object.keys(actionByTick)
    .map((t) => parseInt(t))
    .sort((a, b) => a - b)
    .map((t) => ({ tick: t, ...actionByTick[t] }));

  return (
    <AppShell currentRoute={`/projects/${projectId}/simulations/${simId}`}>
      <AnalyticsView
        run={{
          id: run.id,
          label: run.label,
          status: run.status,
          totalTicks: run.totalTicks,
          currentTick: run.currentTick,
          costUsd: run.costUsd,
          seed: run.seed,
        }}
        actionSeries={actionSeries}
        memoriesByTick={Object.entries(
          memories.reduce<Record<number, number>>((acc, m) => {
            acc[m.tick] = (acc[m.tick] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([tick, n]) => ({ tick: parseInt(tick), n }))}
        importanceDist={memories.map((m) => m.importance)}
        narration={ticks.map((t) => ({ tick: t.index, text: t.narration ?? "" }))}
        siblings={siblings.map((s) => ({
          id: s.id,
          label: s.label,
          status: s.status,
          currentTick: s.currentTick,
          totalTicks: s.totalTicks,
          costUsd: s.costUsd,
        }))}
        projectId={projectId}
        simId={simId}
        runId={runId}
        exportBase={`/api/runs/${runId}/export`}
      />
    </AppShell>
  );
}
