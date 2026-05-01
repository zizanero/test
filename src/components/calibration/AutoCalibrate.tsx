"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

interface DatasetMeta {
  slug: string;
  title: string;
  metricKey: string;
  category: string;
}

interface AbcSample {
  recencyW: number;
  importanceW: number;
  relevanceW: number;
  distance: number;
  accepted: boolean;
}

interface AbcResult {
  numSamples: number;
  numAccepted: number;
  posterior: {
    recencyW: { mean: number; sd: number; q25: number; q50: number; q75: number };
    importanceW: { mean: number; sd: number; q25: number; q50: number; q75: number };
    relevanceW: { mean: number; sd: number; q25: number; q50: number; q75: number };
  };
  bestSample: AbcSample;
  samples: AbcSample[];
  targetDatasetSlug: string;
  targetMetric: string;
  basisMemoriesUsed: number;
}

export function AutoCalibrate({ runId }: { runId: string }) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [target, setTarget] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AbcResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/datasets")
      .then((r) => r.json())
      .then((j: { datasets: DatasetMeta[] }) => {
        setDatasets(j.datasets);
        if (j.datasets.length > 0) setTarget(j.datasets[0].slug);
      })
      .catch(() => {});
  }, []);

  async function start() {
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch(`/api/runs/${runId}/calibrate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetDatasetSlug: target,
          numSamples: 30,
          topK: 5,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "failed");
      setResult(j as AbcResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ai">
        <Sparkles className="h-3 w-3" />
        Auto-calibrate retrieval weights (ABC)
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={running || datasets.length === 0}
          className="rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-xs"
        >
          {datasets.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.title} ({d.metricKey})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={start}
          disabled={running || !target}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Run ABC (30 samples)
        </button>
      </div>
      {err && <div className="mt-2 text-2xs text-danger">{err}</div>}
      {result && <AbcResultBlock r={result} />}
    </div>
  );
}

function AbcResultBlock({ r }: { r: AbcResult }) {
  return (
    <div className="mt-3 rounded-md border border-bg-3 bg-bg-2 p-3">
      <div className="mb-2 flex items-center justify-between text-2xs">
        <span className="text-ink-3">
          accepted {r.numAccepted}/{r.numSamples} · target {r.targetDatasetSlug} ·{" "}
          {r.basisMemoriesUsed} memories
        </span>
        <span className="font-mono text-ink-1">
          best KS {r.bestSample.distance.toFixed(3)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <PosteriorStat label="recency" p={r.posterior.recencyW} />
        <PosteriorStat label="importance" p={r.posterior.importanceW} />
        <PosteriorStat label="relevance" p={r.posterior.relevanceW} />
      </div>
      <div className="mt-3">
        <div className="mb-1 text-2xs text-ink-3">samples (sorted by KS distance)</div>
        <SampleTable samples={r.samples.slice(0, 12)} />
      </div>
      <div className="mt-3 rounded bg-bg-3 p-2 text-2xs">
        <div className="text-ink-3">recommended weights (median posterior)</div>
        <div className="font-mono text-ink-1">
          recency={r.posterior.recencyW.q50.toFixed(2)} · importance=
          {r.posterior.importanceW.q50.toFixed(2)} · relevance=
          {r.posterior.relevanceW.q50.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

function PosteriorStat({
  label,
  p,
}: {
  label: string;
  p: { mean: number; sd: number; q25: number; q50: number; q75: number };
}) {
  return (
    <div className="rounded bg-bg-3 p-2 text-2xs">
      <div className="text-ink-3">{label}</div>
      <div className="font-mono text-ink-1">
        μ {p.mean.toFixed(2)} ± {p.sd.toFixed(2)}
      </div>
      <div className="mt-0.5 font-mono text-ink-3">
        IQR [{p.q25.toFixed(2)}, {p.q75.toFixed(2)}]
      </div>
    </div>
  );
}

function SampleTable({ samples }: { samples: AbcSample[] }) {
  return (
    <div className="rounded border border-bg-3">
      <table className="w-full text-2xs">
        <thead>
          <tr className="text-ink-3">
            <th className="px-1 py-0.5 text-left">rec</th>
            <th className="px-1 py-0.5 text-left">imp</th>
            <th className="px-1 py-0.5 text-left">rel</th>
            <th className="px-1 py-0.5 text-left">KS</th>
            <th className="px-1 py-0.5 text-left">acc</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {samples.map((s, i) => (
            <tr key={i} className={s.accepted ? "text-success" : "text-ink-2"}>
              <td className="px-1 py-0.5">{s.recencyW.toFixed(2)}</td>
              <td className="px-1 py-0.5">{s.importanceW.toFixed(2)}</td>
              <td className="px-1 py-0.5">{s.relevanceW.toFixed(2)}</td>
              <td className="px-1 py-0.5">{s.distance.toFixed(3)}</td>
              <td className="px-1 py-0.5">{s.accepted ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
