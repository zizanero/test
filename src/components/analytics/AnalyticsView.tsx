"use client";

import Link from "next/link";
import { TimeSeriesBlock } from "./TimeSeriesBlock";
import { HistogramBlock } from "./HistogramBlock";
import { ScrollText, FileText, Download, ArrowLeft } from "lucide-react";

interface Props {
  projectId: string;
  simId: string;
  runId: string;
  run: {
    id: string;
    label: string;
    status: string;
    totalTicks: number;
    currentTick: number;
    costUsd: number;
    seed: number;
  };
  actionSeries: { tick: number; [kind: string]: number }[];
  memoriesByTick: { tick: number; n: number }[];
  importanceDist: number[];
  narration: { tick: number; text: string }[];
  siblings: {
    id: string;
    label: string;
    status: string;
    currentTick: number;
    totalTicks: number;
    costUsd: number;
  }[];
  exportBase: string;
}

export function AnalyticsView(props: Props) {
  const actionKinds = Array.from(
    new Set(props.actionSeries.flatMap((p) => Object.keys(p).filter((k) => k !== "tick"))),
  );
  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href={`/projects/${props.projectId}/simulations/${props.simId}/runs/${props.runId}/observe`}
            className="inline-flex items-center gap-1 text-2xs uppercase tracking-wider text-ink-3 hover:text-accent"
          >
            <ArrowLeft className="h-3 w-3" /> Back to observer
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{props.run.label}</h1>
          <div className="mt-1 text-xs text-ink-3">
            Run {props.run.id.slice(0, 8)} · seed {props.run.seed} · ${props.run.costUsd.toFixed(4)} ·{" "}
            {props.run.currentTick}/{props.run.totalTicks} ticks · {props.run.status}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${props.exportBase}/pdf`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-xs hover:border-bg-4"
          >
            <FileText className="h-3 w-3" /> PDF
          </Link>
          <Link
            href={`${props.exportBase}/notebook`}
            className="inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-xs hover:border-bg-4"
          >
            <ScrollText className="h-3 w-3" /> Notebook
          </Link>
          <Link
            href={`${props.exportBase}/csv`}
            className="inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-xs hover:border-bg-4"
          >
            <Download className="h-3 w-3" /> CSV
          </Link>
          <Link
            href={`${props.exportBase}/bundle`}
            className="inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-xs hover:border-bg-4"
          >
            <Download className="h-3 w-3" /> Bundle
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Action distribution over time">
          <TimeSeriesBlock
            data={props.actionSeries}
            xKey="tick"
            yKeys={actionKinds}
          />
        </Block>
        <Block title="Memories created per tick">
          <TimeSeriesBlock
            data={props.memoriesByTick.map((p) => ({ tick: p.tick, memories: p.n }))}
            xKey="tick"
            yKeys={["memories"]}
          />
        </Block>
        <Block title="Memory-importance distribution">
          <HistogramBlock
            values={props.importanceDist}
            min={1}
            max={10}
            bins={10}
          />
        </Block>
        <Block title="Tick-by-tick narration">
          <div className="max-h-72 overflow-auto pr-1">
            <ul className="space-y-1 text-xs">
              {props.narration.map((n) => (
                <li key={n.tick} className="flex gap-2 text-ink-2">
                  <span className="shrink-0 rounded bg-bg-3 px-1 font-mono text-2xs text-ink-3">
                    T={n.tick}
                  </span>
                  <span className="text-ink-1">{n.text || "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        </Block>
      </div>

      {props.siblings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium tracking-tight text-ink-1">
            Comparison · sibling runs of this simulation
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {props.siblings.map((s) => (
              <Link
                key={s.id}
                href={`/projects/${props.projectId}/simulations/${props.simId}/runs/${s.id}/analyze`}
                className="rounded-lg border border-bg-3 bg-bg-1 p-3 hover:border-bg-4"
              >
                <div className="text-xs font-medium text-ink-1">{s.label}</div>
                <div className="mt-1 text-2xs text-ink-3">
                  {s.currentTick}/{s.totalTicks} ticks · ${s.costUsd.toFixed(4)} ·{" "}
                  {s.status}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-bg-3 bg-bg-1 p-3">
      <h3 className="mb-2 text-2xs uppercase tracking-wider text-ink-3">{title}</h3>
      {children}
    </section>
  );
}
