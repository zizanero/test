import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { WorldLayer } from "@/components/builder/WorldLayer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; simId: string }>;
}) {
  const { projectId, simId } = await params;
  const sim = await prisma.simulation.findUnique({
    where: { id: simId },
    include: { worlds: { include: { locations: true } } },
  });
  if (!sim) notFound();
  const world = sim.worlds[0];
  return (
    <AppShell currentRoute={`/projects/${projectId}/simulations/${simId}`}>
      <BuilderShell projectId={projectId} simId={simId} layer="world" simName={sim.name}>
        <WorldLayer
          world={
            world
              ? {
                  width: world.width,
                  height: world.height,
                  locations: world.locations.map((l) => ({
                    id: l.id,
                    name: l.name,
                    kind: l.kind,
                    x: l.x,
                    y: l.y,
                    capacity: l.capacity,
                  })),
                }
              : { width: 16, height: 12, locations: [] }
          }
        />
      </BuilderShell>
    </AppShell>
  );
}
