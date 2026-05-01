import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { ConfigurePanel } from "@/components/configure/ConfigurePanel";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConfigurePage({
  params,
}: {
  params: Promise<{ projectId: string; simId: string }>;
}) {
  const { projectId, simId } = await params;
  const sim = await prisma.simulation.findUnique({
    where: { id: simId },
    include: {
      populations: { include: { agentClasses: true } },
      worlds: { include: { locations: true } },
      rules: true,
      runs: { orderBy: { startedAt: "desc" }, take: 5 },
    },
  });
  if (!sim) notFound();
  return (
    <AppShell currentRoute={`/projects/${projectId}/simulations/${simId}`}>
      <ConfigurePanel
        projectId={projectId}
        simulation={{
          id: sim.id,
          name: sim.name,
          description: sim.description ?? null,
          templateSlug: sim.templateSlug ?? null,
          totalAgents: sim.populations.reduce(
            (s, p) => s + p.agentClasses.reduce((c, a) => c + a.count, 0),
            0,
          ),
          locationCount: sim.worlds.reduce((s, w) => s + w.locations.length, 0),
          ruleCount: sim.rules.length,
          recentRuns: sim.runs.map((r) => ({
            id: r.id,
            label: r.label,
            status: r.status,
            currentTick: r.currentTick,
            totalTicks: r.totalTicks,
            costUsd: r.costUsd,
            seed: r.seed,
            startedAt: r.startedAt?.toISOString() ?? null,
          })),
        }}
      />
    </AppShell>
  );
}
