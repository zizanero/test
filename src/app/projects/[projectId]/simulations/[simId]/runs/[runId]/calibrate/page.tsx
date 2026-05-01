import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { CalibrationView } from "@/components/calibration/CalibrationView";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; simId: string; runId: string }>;
}) {
  const { projectId, simId, runId } = await params;
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) notFound();

  // Default candidate metric: per-tick decision count (proxy for activity).
  const tickCounts = await prisma.decision.groupBy({
    by: ["tick"],
    where: { runId },
    _count: { _all: true },
    orderBy: { tick: "asc" },
  });

  const memories = await prisma.memory.findMany({
    where: { runId },
    select: { importance: true },
    take: 5000,
  });

  return (
    <AppShell currentRoute={`/projects/${projectId}/simulations/${simId}`}>
      <CalibrationView
        projectId={projectId}
        simId={simId}
        runId={runId}
        runLabel={run.label}
        simulatedSeries={tickCounts.map((t) => ({ tick: t.tick, value: t._count._all }))}
        importanceSamples={memories.map((m) => m.importance)}
      />
    </AppShell>
  );
}
