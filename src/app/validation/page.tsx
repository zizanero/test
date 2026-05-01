import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/server/db";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ValidationPage() {
  const datasets = await prisma.dataset.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      title: true,
      source: true,
      category: true,
      description: true,
      metricKey: true,
      license: true,
    },
  });
  return (
    <AppShell currentRoute="/validation">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-ink-3">
            <ShieldCheck className="h-3 w-3" />
            Validation Library
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Reference datasets for calibration
          </h1>
          <p className="mt-2 max-w-2xl text-md text-ink-2">
            Curated empirical distributions you can compare your simulation against on
            the run-level Calibrate tab. KS distance and Wasserstein-1 are surfaced
            with traffic-light coding.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {datasets.map((d) => (
            <article
              key={d.slug}
              className="rounded-lg border border-bg-3 bg-bg-1 p-4"
            >
              <div className="mb-1 inline-flex rounded bg-bg-3 px-1.5 py-0.5 text-2xs uppercase tracking-wider text-ink-2">
                {d.category}
              </div>
              <h2 className="text-md font-medium">{d.title}</h2>
              <div className="mt-0.5 text-2xs text-ink-3">{d.source}</div>
              <p className="mt-2 text-xs text-ink-1">{d.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-2xs">
                <span className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-ink-2">
                  metric: {d.metricKey}
                </span>
                {d.license && (
                  <span className="text-ink-3">{d.license}</span>
                )}
              </div>
            </article>
          ))}
        </div>
        {datasets.length === 0 && (
          <div className="rounded-lg border border-dashed border-bg-3 p-8 text-center text-xs text-ink-3">
            No datasets seeded. Run <code>npm run db:seed</code>.
          </div>
        )}
      </div>
    </AppShell>
  );
}
