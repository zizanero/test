"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Play, ExternalLink } from "lucide-react";

interface Sim {
  id: string;
  name: string;
  description: string | null;
  templateSlug: string | null;
  totalAgents: number;
  locationCount: number;
  ruleCount: number;
  recentRuns: {
    id: string;
    label: string;
    status: string;
    currentTick: number;
    totalTicks: number;
    costUsd: number;
    seed: number;
    startedAt: string | null;
  }[];
}

export function ConfigurePanel({
  projectId,
  simulation,
}: {
  projectId: string;
  simulation: Sim;
}) {
  const [seed, setSeed] = useState(42);
  const [totalTicks, setTotalTicks] = useState(60);
  const [costCap, setCostCap] = useState(2);
  const [fidelity, setFidelity] = useState<"cheap" | "balanced" | "high_fidelity">("balanced");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function startRun() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          simulationId: simulation.id,
          seed,
          totalTicks,
          costCap,
          fidelity,
          label: `seed=${seed}, ${totalTicks}t, ${fidelity}`,
        }),
      });
      const j = (await res.json()) as { runId?: string; error?: string };
      if (j.runId)
        router.push(
          `/projects/${projectId}/simulations/${simulation.id}/runs/${j.runId}/observe`,
        );
      else setErr(j.error ?? "Failed to start run");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-8">
      <header className="mb-6">
        <div className="text-2xs uppercase tracking-wider text-ink-3">Simulation</div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{simulation.name}</h1>
        {simulation.description && (
          <p className="mt-1 max-w-2xl text-md text-ink-2">{simulation.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Stat label="agents" value={simulation.totalAgents} />
          <Stat label="locations" value={simulation.locationCount} />
          <Stat label="rules" value={simulation.ruleCount} />
          {simulation.templateSlug && (
            <span className="rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-2xs uppercase text-ink-2">
              from {simulation.templateSlug}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/projects/${projectId}/simulations/${simulation.id}/builder/population`}
            className="rounded-md border border-bg-3 bg-bg-2 px-3 py-1 text-xs hover:border-bg-4"
          >
            Edit population
          </Link>
          <Link
            href={`/projects/${projectId}/simulations/${simulation.id}/builder/world`}
            className="rounded-md border border-bg-3 bg-bg-2 px-3 py-1 text-xs hover:border-bg-4"
          >
            Edit world
          </Link>
          <Link
            href={`/projects/${projectId}/simulations/${simulation.id}/builder/rules`}
            className="rounded-md border border-bg-3 bg-bg-2 px-3 py-1 text-xs hover:border-bg-4"
          >
            Edit rules
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-bg-3 bg-bg-1 p-4">
          <h2 className="mb-3 text-sm font-medium tracking-tight">Run configuration</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Random seed">
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                className="w-full rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-sm font-mono"
              />
            </Field>
            <Field label="Total ticks">
              <input
                type="number"
                value={totalTicks}
                onChange={(e) => setTotalTicks(parseInt(e.target.value) || 0)}
                className="w-full rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-sm font-mono"
              />
            </Field>
            <Field label="Cost cap (USD)">
              <input
                type="number"
                step="0.5"
                value={costCap}
                onChange={(e) => setCostCap(parseFloat(e.target.value) || 0)}
                className="w-full rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-sm font-mono"
              />
            </Field>
            <Field label="Fidelity">
              <select
                value={fidelity}
                onChange={(e) =>
                  setFidelity(e.target.value as "cheap" | "balanced" | "high_fidelity")
                }
                className="w-full rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-sm"
              >
                <option value="cheap">cheap (Haiku-only)</option>
                <option value="balanced">balanced (Haiku + Sonnet)</option>
                <option value="high_fidelity">high fidelity (Sonnet)</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-bg-3 pt-3">
            <div className="text-2xs text-ink-3">
              Mock LLM is used when ANTHROPIC_API_KEY is empty.
            </div>
            <button
              type="button"
              onClick={startRun}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Start run
            </button>
          </div>
          {err && <div className="mt-2 text-xs text-danger">{err}</div>}
        </section>

        <section className="rounded-lg border border-bg-3 bg-bg-1 p-4">
          <h2 className="mb-3 text-sm font-medium tracking-tight">Recent runs</h2>
          {simulation.recentRuns.length === 0 ? (
            <div className="rounded-md border border-dashed border-bg-3 px-3 py-6 text-center text-xs text-ink-3">
              No runs yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {simulation.recentRuns.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-bg-3 bg-bg-2 px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1 truncate">
                    <div className="truncate text-ink-1">{r.label}</div>
                    <div className="text-2xs text-ink-3">
                      seed={r.seed} · tick {r.currentTick}/{r.totalTicks} · ${r.costUsd.toFixed(3)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-2xs uppercase ${
                        r.status === "running"
                          ? "bg-info/20 text-info"
                          : r.status === "completed"
                            ? "bg-success/20 text-success"
                            : r.status === "failed"
                              ? "bg-danger/20 text-danger"
                              : "bg-bg-3 text-ink-2"
                      }`}
                    >
                      {r.status}
                    </span>
                    <Link
                      href={`/projects/${projectId}/simulations/${simulation.id}/runs/${r.id}/observe`}
                      className="text-ink-2 hover:text-accent"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-2xs">
      <span className="font-mono tabular-nums text-ink-1">{value}</span>{" "}
      <span className="text-ink-3">{label}</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-2xs uppercase tracking-wider text-ink-3">{label}</div>
      {children}
    </label>
  );
}
