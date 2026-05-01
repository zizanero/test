import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { PopulationLayer } from "@/components/builder/PopulationLayer";
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
    include: { populations: { include: { agentClasses: true } } },
  });
  if (!sim) notFound();
  return (
    <AppShell currentRoute={`/projects/${projectId}/simulations/${simId}`}>
      <BuilderShell projectId={projectId} simId={simId} layer="population" simName={sim.name}>
        <PopulationLayer
          simId={simId}
          classes={sim.populations.flatMap((p) =>
            p.agentClasses.map((c) => ({
              id: c.id,
              name: c.name,
              count: c.count,
              proseIdentity: c.proseIdentity,
              modelTier: c.modelTier,
            })),
          )}
        />
      </BuilderShell>
    </AppShell>
  );
}
