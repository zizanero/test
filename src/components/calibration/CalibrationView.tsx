"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, ArrowLeft } from "lucide-react";
import { TimeSeriesBlock } from "@/components/analytics/TimeSeriesBlock";
import { ksDistance, wasserstein1 } from "@/lib/ksDistance";
import { AutoCalibrate } from "./AutoCalibrate";

export function CalibrationView({
  projectId,
  simId,
  runId,
  runLabel,
  simulatedSeries,
  importanceSamples,
}: {
  projectId: string;
  simId: string;
  runId: string;
  runLabel: string;
  simulatedSeries: { tick: number; value: number }[];
  importanceSamples: number[];
}) {
  const [empirical, setEmpirical] = useState<number[]>([]);
  const [empiricalLabel, setEmpiricalLabel] = useState<string>("");

  function loadCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      const numbers: number[] = [];
      for (const line of lines) {
        const cols = line.split(/[,;\t]/);
        for (const c of cols) {
          const n = parseFloat(c);
          if (Number.isFinite(n)) numbers.push(n);
        }
      }
      setEmpirical(numbers);
      setEmpiricalLabel(file.name);
    };
    reader.readAsText(file);
  }

  const ks = ksDistance(importanceSamples, empirical);
  const w1 = wasserstein1(importanceSamples, empirical);

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <header className="mb-6">
        <Link
          href={`/projects/${projectId}/simulations/${simId}/runs/${runId}/observe`}
          className="inline-flex items-center gap-1 text-2xs uppercase tracking-wider text-ink-3 hover:text-accent"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Calibration · {runLabel}
        </h1>
        <p className="mt-1 max-w-2xl text-md text-ink-2">
          Upload a CSV with empirical values to compare against simulated distributions.
          MVP target metric: memory-importance distribution. KS and Wasserstein-1 are
          shown below.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-bg-3 bg-bg-1 p-4">
          <h3 className="mb-2 text-2xs uppercase tracking-wider text-ink-3">
            Simulated · activity per tick
          </h3>
          <TimeSeriesBlock
            data={simulatedSeries.map((p) => ({ tick: p.tick, decisions: p.value }))}
            xKey="tick"
            yKeys={["decisions"]}
          />
        </section>
        <section className="rounded-lg border border-bg-3 bg-bg-1 p-4">
          <h3 className="mb-2 text-2xs uppercase tracking-wider text-ink-3">
            Empirical CSV
          </h3>
          <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-bg-3 bg-bg-2 px-3 py-3 text-xs text-ink-2 hover:border-bg-4">
            <Upload className="h-3.5 w-3.5" />
            <span>{empiricalLabel || "Click to upload CSV"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadCsv(f);
              }}
            />
          </label>
          <div className="text-2xs text-ink-3">
            {empirical.length > 0
              ? `${empirical.length} numeric values loaded.`
              : "No empirical data yet."}
          </div>
          {empirical.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="KS distance" value={ks.toFixed(3)} traffic={ks < 0.1 ? "ok" : ks < 0.25 ? "warn" : "bad"} />
              <Metric
                label="Wasserstein-1"
                value={Number.isFinite(w1) ? w1.toFixed(3) : "—"}
                traffic={Number.isFinite(w1) && w1 < 1 ? "ok" : "warn"}
              />
            </div>
          )}
        </section>
      </div>
      <section className="mt-4 rounded-lg border border-bg-3 bg-bg-1 p-4">
        <AutoCalibrate runId={runId} />
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  traffic,
}: {
  label: string;
  value: string;
  traffic: "ok" | "warn" | "bad";
}) {
  const color =
    traffic === "ok"
      ? "text-success"
      : traffic === "warn"
        ? "text-warn"
        : "text-danger";
  return (
    <div className="rounded-md border border-bg-3 bg-bg-2 p-2">
      <div className="text-2xs uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`mt-0.5 font-mono text-md ${color}`}>{value}</div>
    </div>
  );
}
