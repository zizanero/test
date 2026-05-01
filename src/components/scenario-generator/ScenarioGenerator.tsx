"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { DiffPanel, type DiffField } from "@/components/ai/DiffPanel";

interface GeneratedScenario {
  title: string;
  category: string;
  description: string;
  population: { classes: { name: string; count: number; proseIdentity: string; initialLocationName: string }[] };
  world: {
    name: string;
    width: number;
    height: number;
    locations: { name: string; x: number; y: number; capacity: number | null }[];
  };
  rules: { name: string; triggerSpec: { atTick?: number; everyN?: number }; effect: { kind: string; payload?: Record<string, unknown> } }[];
  scenario: { totalTicks: number; fidelity: string; defaultSeed: number; costCapUsd: number };
}

interface GenerateResponse {
  ok: boolean;
  scenario: GeneratedScenario | null;
  errors: string[];
  promptVersion: string;
  modelName: string;
  costUsd: number;
  simulationId: string | null;
}

export function ScenarioGenerator({ projectId }: { projectId: string }) {
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function generate() {
    if (description.trim().length < 8) {
      setError("Describe a scenario in at least 8 characters.");
      return;
    }
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/ai/scenario`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description, apply: false }),
      });
      const j = (await res.json()) as GenerateResponse;
      setResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function apply() {
    if (!result?.scenario) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/ai/scenario`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description, apply: true, projectId }),
      });
      const j = (await res.json()) as GenerateResponse;
      if (j.simulationId) {
        router.push(`/projects/${projectId}/simulations/${j.simulationId}/configure`);
      } else {
        setError("Apply failed; check console.");
      }
    } finally {
      setApplying(false);
    }
  }

  const diffFields: DiffField[] = result?.scenario
    ? [
        { path: "title", before: "(none)", after: result.scenario.title },
        { path: "category", before: "(none)", after: result.scenario.category },
        {
          path: "population.classes",
          before: "(none)",
          after: result.scenario.population.classes.map((c) => ({
            name: c.name,
            count: c.count,
            initialLocationName: c.initialLocationName,
          })),
        },
        {
          path: "world.locations",
          before: "(none)",
          after: result.scenario.world.locations.map((l) => l.name),
        },
        {
          path: "rules",
          before: "(none)",
          after: result.scenario.rules.map((r) => ({
            name: r.name,
            atTick: r.triggerSpec.atTick,
            effect: r.effect.kind,
          })),
        },
        {
          path: "scenario",
          before: "(none)",
          after: result.scenario.scenario,
        },
      ]
    : [];

  return (
    <div className="rounded-lg border border-bg-3 bg-bg-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wand2 className="h-3.5 w-3.5 text-ai" />
        <h2 className="text-md font-medium tracking-tight">Describe a scenario</h2>
        <span className="rounded bg-ai/15 px-1.5 py-0.5 text-2xs uppercase tracking-wider text-ai">
          AI
        </span>
      </div>
      <p className="mb-2 text-xs text-ink-2">
        A small town's mayor announces a controversial policy. Show me how opinion
        forms over a week.
      </p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the population, the world, and the question…"
        className="h-24 w-full rounded-md border border-bg-3 bg-bg-2 p-2 text-xs leading-relaxed text-ink-1 focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="text-2xs text-ink-3">
          {description.length} chars · uses Sonnet (or mock when no key)
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Generate
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}
      {result && (
        <div className="mt-4">
          {!result.ok && result.errors.length > 0 && (
            <div className="mb-2 rounded-md border border-warn/30 bg-warn/10 p-2 text-2xs text-warn">
              <div className="font-medium">Validation issues</div>
              <ul className="mt-0.5 list-disc pl-4">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {result.scenario && (
            <DiffPanel
              title={`Generated: ${result.scenario.title}`}
              description={`${result.scenario.category} · ${result.modelName} · prompt ${result.promptVersion}`}
              fields={diffFields}
              onAccept={apply}
              onReject={() => setResult(null)}
              busy={applying}
            />
          )}
        </div>
      )}
    </div>
  );
}
