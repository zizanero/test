"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Sparkles, GitBranch, AlertTriangle, Play } from "lucide-react";

interface CausalCause {
  label: string;
  confidence: number;
  evidenceMemoryIds: string[];
  evidenceAgentIds: string[];
  perturbation: string;
}

interface CausalAnalysis {
  narrative: string;
  causes: CausalCause[];
  noEvidence: boolean;
  retrievedMemoryIds: string[];
  retrievedAgentIds: string[];
  promptVersion: string;
  modelName: string;
  costUsd: number;
}

interface CounterfactualResult {
  groupId: string;
  replicates: number;
  metric: string;
  control: number[];
  treatment: number[];
  controlMean: number;
  treatmentMean: number;
  effectSize: number;
  effectStdErr: number;
  perturbationLabel: string;
}

interface Props {
  runId: string;
  agentId: string;
  agentName: string;
  tick: number;
  decisionId?: string;
  onClose: () => void;
}

export function WhySheet({ runId, agentId, agentName, tick, decisionId, onClose }: Props) {
  const [analysis, setAnalysis] = useState<CausalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/runs/${runId}/why`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, tick, decisionId }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "failed");
        return j as CausalAnalysis;
      })
      .then(setAnalysis)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [runId, agentId, tick, decisionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/60 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1"
      />
      <aside className="flex h-full w-full max-w-[760px] flex-col border-l border-bg-3 bg-bg-1 shadow-2xl">
        <header className="flex items-start justify-between border-b border-bg-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-2xs uppercase tracking-wider text-ink-3">
              Causal interrogation
            </div>
            <h2 className="mt-0.5 truncate text-md font-medium tracking-tight">
              Why did {agentName} act at tick {tick}?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-3 hover:bg-bg-2 hover:text-ink-1"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-8 text-xs text-ink-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> The analyst is reading the trace…
            </div>
          )}
          {error && (
            <div className="m-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
          {analysis && !loading && (
            <div className="space-y-4 p-4">
              <Section
                title="Narrative"
                icon={<Sparkles className="h-3 w-3 text-ai" />}
              >
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-1">
                  {analysis.narrative}
                </p>
                {analysis.noEvidence && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-2xs text-warn">
                    <AlertTriangle className="h-3 w-3" /> no causal evidence found in trace
                  </div>
                )}
                <div className="mt-2 text-2xs text-ink-3">
                  prompt {analysis.promptVersion} · {analysis.modelName} · $
                  {analysis.costUsd.toFixed(4)}
                </div>
              </Section>

              {analysis.causes.length > 0 && (
                <Section title="Ranked but-for causes">
                  <ul className="space-y-2">
                    {analysis.causes
                      .slice()
                      .sort((a, b) => b.confidence - a.confidence)
                      .map((c, i) => (
                        <CauseRow
                          key={i}
                          c={c}
                          runId={runId}
                          atTick={tick}
                        />
                      ))}
                  </ul>
                </Section>
              )}

              <Section title="Trace evidence used">
                <div className="grid gap-2 text-2xs">
                  <div>
                    <span className="text-ink-3">memories: </span>
                    {analysis.retrievedMemoryIds.length === 0 ? (
                      <span className="text-ink-3">(none)</span>
                    ) : (
                      analysis.retrievedMemoryIds.map((id) => (
                        <span
                          key={id}
                          className="mr-1 inline-block rounded bg-bg-3 px-1 py-0.5 font-mono text-ink-2"
                        >
                          [m:{id.slice(0, 6)}]
                        </span>
                      ))
                    )}
                  </div>
                  <div>
                    <span className="text-ink-3">neighborhood agents: </span>
                    {analysis.retrievedAgentIds.length === 0 ? (
                      <span className="text-ink-3">(none)</span>
                    ) : (
                      analysis.retrievedAgentIds.map((id) => (
                        <span
                          key={id}
                          className="mr-1 inline-block rounded bg-bg-3 px-1 py-0.5 font-mono text-ink-2"
                        >
                          [a:{id.slice(0, 6)}]
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </Section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ink-3">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function CauseRow({
  c,
  runId,
  atTick,
}: {
  c: CausalCause;
  runId: string;
  atTick: number;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CounterfactualResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function runCounterfactual() {
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch(`/api/runs/${runId}/counterfactual`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          atTick,
          replicates: 5,
          horizonTicks: 15,
          metric: "decision_count",
          perturbationLabel: c.label,
          // For MVP we encode the perturbation as an injected observation. For ambient-style
          // perturbations the user can pick a different metric from a future picker.
          perturbation: {
            kind: "inject_observation",
            text: c.perturbation,
            fraction: 1,
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "failed");
      setResult(j as CounterfactualResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <li className="rounded-md border border-bg-3 bg-bg-2 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-ink-1">{c.label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {c.evidenceMemoryIds.slice(0, 3).map((id) => (
              <span
                key={id}
                className="rounded bg-bg-3 px-1 py-0.5 font-mono text-2xs text-ink-2"
              >
                [m:{id.slice(0, 6)}]
              </span>
            ))}
            {c.evidenceAgentIds.slice(0, 2).map((id) => (
              <span
                key={id}
                className="rounded bg-bg-3 px-1 py-0.5 font-mono text-2xs text-ink-2"
              >
                [a:{id.slice(0, 6)}]
              </span>
            ))}
          </div>
          {c.perturbation && (
            <div className="mt-1 text-2xs italic text-ink-3">
              what if: {c.perturbation}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <ConfidenceBar value={c.confidence} />
          <button
            type="button"
            onClick={runCounterfactual}
            disabled={running}
            className="inline-flex items-center gap-1 rounded-md border border-bg-3 bg-bg-1 px-2 py-1 text-2xs hover:border-bg-4 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Run counterfactual
          </button>
        </div>
      </div>
      {err && <div className="mt-2 text-2xs text-danger">{err}</div>}
      {result && <CounterfactualResultBlock r={result} />}
    </li>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-2xs text-ink-3">{value.toFixed(2)}</span>
      <div className="h-1 w-12 rounded-full bg-bg-3">
        <div
          className="h-1 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CounterfactualResultBlock({ r }: { r: CounterfactualResult }) {
  const significant =
    r.effectStdErr > 0 && Math.abs(r.effectSize) / r.effectStdErr > 1.5;
  return (
    <div className="mt-2 rounded-md border border-bg-3 bg-bg-1 p-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-2xs">
          <GitBranch className="h-3 w-3 text-accent" />
          <span className="text-ink-2">{r.replicates}x control + {r.replicates}x treatment</span>
        </div>
        <span
          className={`rounded px-1 py-0.5 text-2xs font-mono ${
            significant ? "bg-info/20 text-info" : "bg-bg-3 text-ink-3"
          }`}
        >
          {r.metric}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-2xs">
        <Stat label="control μ" value={r.controlMean.toFixed(2)} />
        <Stat label="treatment μ" value={r.treatmentMean.toFixed(2)} />
        <Stat
          label="Δ ± SE"
          value={`${r.effectSize >= 0 ? "+" : ""}${r.effectSize.toFixed(2)} ± ${r.effectStdErr.toFixed(2)}`}
        />
      </div>
      <DotPlot control={r.control} treatment={r.treatment} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-bg-2 px-2 py-1">
      <div className="text-2xs text-ink-3">{label}</div>
      <div className="font-mono text-xs text-ink-1">{value}</div>
    </div>
  );
}

function DotPlot({ control, treatment }: { control: number[]; treatment: number[] }) {
  const all = [...control, ...treatment];
  if (all.length === 0) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = Math.max(1, max - min);
  return (
    <div className="mt-2 h-10 w-full rounded-md bg-bg-2">
      <div className="relative h-full">
        {control.map((v, i) => (
          <span
            key={"c" + i}
            title={`control ${v}`}
            className="absolute top-1.5 h-2 w-2 rounded-full bg-ink-2"
            style={{ left: `${((v - min) / range) * 100}%` }}
          />
        ))}
        {treatment.map((v, i) => (
          <span
            key={"t" + i}
            title={`treatment ${v}`}
            className="absolute bottom-1.5 h-2 w-2 rounded-full bg-accent"
            style={{ left: `${((v - min) / range) * 100}%` }}
          />
        ))}
        <span className="absolute -bottom-3 left-0 font-mono text-2xs text-ink-3">{min.toFixed(0)}</span>
        <span className="absolute -bottom-3 right-0 font-mono text-2xs text-ink-3">{max.toFixed(0)}</span>
      </div>
    </div>
  );
}
