import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { RulesLayer } from "@/components/builder/RulesLayer";
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
    include: { rules: true },
  });
  if (!sim) notFound();
  return (
    <AppShell currentRoute={`/projects/${projectId}/simulations/${simId}`}>
      <BuilderShell projectId={projectId} simId={simId} layer="rules" simName={sim.name}>
        <RulesLayer
          rules={sim.rules.map((r) => ({
            id: r.id,
            name: r.name,
            triggerKind: r.triggerKind,
            triggerSpec: r.triggerSpec,
            effect: r.effect,
          }))}
        />
      </BuilderShell>
    </AppShell>
  );
}
