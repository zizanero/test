import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { LiveObserver } from "@/components/observer/LiveObserver";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ObservePage({
  params,
}: {
  params: Promise<{ projectId: string; simId: string; runId: string }>;
}) {
  const { projectId, simId, runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      simulation: {
        include: {
          worlds: { include: { locations: true } },
          populations: { include: { agentClasses: true } },
        },
      },
    },
  });
  if (!run) notFound();
  const agents = await prisma.agent.findMany({ where: { runId } });
  const ticks = await prisma.tick.count({ where: { runId } });

  const world = run.simulation.worlds[0];
  return (
    <AppShell currentRoute={`/projects/${projectId}/simulations/${simId}`}>
      <LiveObserver
        projectId={projectId}
        simId={simId}
        runId={runId}
        run={{
          id: run.id,
          label: run.label,
          status: run.status,
          totalTicks: run.totalTicks,
          currentTick: run.currentTick,
          seed: run.seed,
          costUsd: run.costUsd,
        }}
        world={
          world
            ? {
                width: world.width,
                height: world.height,
                locations: world.locations.map((l) => ({
                  id: l.id,
                  name: l.name,
                  x: l.x,
                  y: l.y,
                  capacity: l.capacity,
                  kind: l.kind,
                })),
              }
            : { width: 16, height: 12, locations: [] }
        }
        initialAgents={agents.map((a) => ({
          id: a.id,
          displayName: a.displayName,
          locationId: a.currentLocationId,
          goal: a.goal,
          status: a.status,
        }))}
        ticksRecorded={ticks}
      />
    </AppShell>
  );
}
