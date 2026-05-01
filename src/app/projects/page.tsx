import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { FolderTree, FlaskConical } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: {
      simulations: { include: { runs: { orderBy: { startedAt: "desc" }, take: 3 } } },
    },
  });
  return (
    <AppShell currentRoute="/projects">
      <div className="mx-auto max-w-[1280px] px-8 py-10">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Projects</h1>
        <div className="space-y-6">
          {projects.map((p) => (
            <div key={p.id} className="rounded-lg border border-bg-3 bg-bg-1 p-4">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-ink-2" />
                <h2 className="text-md font-medium">{p.name}</h2>
                <span className="text-xs text-ink-3">{p.simulations.length} sims</span>
              </div>
              {p.description && (
                <p className="mt-1 text-xs text-ink-3">{p.description}</p>
              )}
              <ul className="mt-3 space-y-1">
                {p.simulations.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-bg-3 bg-bg-2 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-3.5 w-3.5 text-ink-2" />
                      <Link
                        href={`/projects/${p.id}/simulations/${s.id}/configure`}
                        className="text-sm hover:text-accent"
                      >
                        {s.name}
                      </Link>
                      {s.templateSlug && (
                        <span className="rounded bg-bg-3 px-1.5 py-0.5 text-2xs uppercase text-ink-3">
                          {s.templateSlug}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-ink-3">
                      {s.runs.slice(0, 3).map((r) => (
                        <Link
                          key={r.id}
                          href={`/projects/${p.id}/simulations/${s.id}/runs/${r.id}/observe`}
                          className="rounded bg-bg-3 px-1.5 py-0.5 hover:text-accent"
                        >
                          {r.label} · {r.status}
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
                {p.simulations.length === 0 && (
                  <li className="rounded-md border border-dashed border-bg-3 px-3 py-6 text-center text-xs text-ink-3">
                    No simulations yet — instantiate a template to begin.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
