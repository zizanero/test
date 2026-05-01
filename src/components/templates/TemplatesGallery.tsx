"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { ScenarioGenerator } from "@/components/scenario-generator/ScenarioGenerator";

interface Template {
  slug: string;
  title: string;
  category: string;
  description: string;
  attribution: string | null;
  readmeMd: string;
}

export function TemplatesGallery({ templates }: { templates: Template[] }) {
  const [active, setActive] = useState<string | null>(templates[0]?.slug ?? null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const sel = templates.find((t) => t.slug === active);

  async function instantiate() {
    if (!sel) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${sel.slug}/instantiate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "default-project" }),
      });
      const j = (await res.json()) as { simulationId?: string };
      if (j.simulationId)
        router.push(`/projects/default-project/simulations/${j.simulationId}/configure`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[280px,1fr]">
      <aside className="overflow-auto border-r border-bg-3 bg-bg-1 p-2">
        <div className="px-2 py-2">
          <h2 className="text-md font-medium tracking-tight">Templates</h2>
          <p className="mt-1 text-xs text-ink-3">
            Curated starting points across eight categories.
          </p>
        </div>
        <div className="mt-2 flex flex-col gap-0.5">
          {templates.map((t) => (
            <button
              type="button"
              key={t.slug}
              onClick={() => setActive(t.slug)}
              className={cn(
                "rounded-md px-2 py-1.5 text-left text-sm",
                active === t.slug
                  ? "bg-bg-3 text-ink-0"
                  : "text-ink-1 hover:bg-bg-2",
              )}
            >
              <div>{t.title}</div>
              <div className="text-2xs text-ink-3">{t.category}</div>
            </button>
          ))}
        </div>
      </aside>
      <section className="overflow-auto p-8">
        {sel && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 inline-flex rounded bg-bg-3 px-1.5 py-0.5 text-2xs uppercase tracking-wider text-ink-2">
              {sel.category}
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{sel.title}</h1>
            {sel.attribution && (
              <p className="mt-1 text-xs text-ink-3">{sel.attribution}</p>
            )}
            <p className="mt-3 max-w-2xl text-md text-ink-1">{sel.description}</p>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={instantiate}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Instantiate &amp; configure
              </button>
            </div>
            <div className="mt-8 rounded-lg border border-bg-3 bg-bg-1 p-4">
              <h3 className="mb-2 text-sm font-medium text-ink-1">Readme</h3>
              <pre className="whitespace-pre-wrap text-xs text-ink-2">{sel.readmeMd}</pre>
            </div>
            <div className="mt-6">
              <ScenarioGenerator projectId="default-project" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
