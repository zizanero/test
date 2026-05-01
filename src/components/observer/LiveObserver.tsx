"use client";

import { useEffect, useMemo, useState } from "react";
import { TransportBar } from "./TransportBar";
import { SpatialCanvas } from "./SpatialCanvas";
import { Timeline } from "./Timeline";
import { NarrationRibbon } from "./NarrationRibbon";
import { AgentInspector } from "@/components/inspector/AgentInspector";
import { useObserverStore } from "@/store/observerStore";
import { useTickStream } from "@/hooks/useTickStream";
import Link from "next/link";
import { BarChart3, ScrollText, GitBranch } from "lucide-react";

interface LocationInput {
  id: string;
  name: string;
  x: number;
  y: number;
  capacity: number | null;
  kind: string;
}

interface AgentInput {
  id: string;
  displayName: string;
  locationId: string | null;
  goal: string | null;
  status: string;
}

interface RunInput {
  id: string;
  label: string;
  status: string;
  totalTicks: number;
  currentTick: number;
  seed: number;
  costUsd: number;
}

interface Props {
  projectId: string;
  simId: string;
  runId: string;
  run: RunInput;
  world: { width: number; height: number; locations: LocationInput[] };
  initialAgents: AgentInput[];
  ticksRecorded: number;
}

export function LiveObserver(props: Props) {
  const { run, world, initialAgents, runId, projectId, simId } = props;
  const reset = useObserverStore((s) => s.reset);
  const pushTick = useObserverStore((s) => s.pushTick);
  const selectedAgentId = useObserverStore((s) => s.selectedAgentId);

  const agentNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of initialAgents) m.set(a.id, a.displayName);
    return m;
  }, [initialAgents]);

  // Reset store when run changes; seed initial agents at tick 0.
  useEffect(() => {
    reset();
    pushTick(
      0,
      initialAgents.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        locationId: a.locationId,
        goal: a.goal,
      })),
    );
  }, [runId, reset, pushTick, initialAgents]);

  useTickStream(runId, agentNames);

  return (
    <div className="grid h-full grid-cols-[1fr,360px] grid-rows-[auto,1fr,auto]">
      <header className="col-span-2 flex items-center justify-between border-b border-bg-3 bg-bg-1 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}/simulations/${simId}/configure`}
            className="text-2xs uppercase tracking-wider text-ink-3 hover:text-accent"
          >
            ← Configure
          </Link>
          <span className="text-md font-medium tracking-tight">{run.label}</span>
          <span className="rounded bg-bg-3 px-1.5 py-0.5 text-2xs uppercase text-ink-2">
            seed={run.seed}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/simulations/${simId}/runs/${runId}/analyze`}
            className="inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-xs hover:border-bg-4"
          >
            <BarChart3 className="h-3 w-3" /> Analyze
          </Link>
          <Link
            href={`/projects/${projectId}/simulations/${simId}/runs/${runId}/calibrate`}
            className="inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-xs hover:border-bg-4"
          >
            <ScrollText className="h-3 w-3" /> Calibrate
          </Link>
          <BranchButton runId={runId} />
        </div>
      </header>
      <NarrationRibbon />
      <div className="row-start-2 row-end-3 flex flex-col">
        <TransportBar runId={runId} totalTicks={run.totalTicks} />
        <div className="min-h-0 flex-1 bg-bg-1">
          <SpatialCanvas world={world} />
        </div>
      </div>
      <div className="col-start-2 row-start-2 row-end-4 border-l border-bg-3 bg-bg-1">
        <AgentInspector
          runId={runId}
          selectedAgentId={selectedAgentId}
          fallbackAgents={initialAgents}
        />
      </div>
      <Timeline runId={runId} totalTicks={run.totalTicks} />
    </div>
  );
}

function BranchButton({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const currentTick = useObserverStore((s) => s.currentTick);
  async function fork() {
    setBusy(true);
    try {
      await fetch(`/api/runs/${runId}/branch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          atTick: Math.max(0, currentTick - 1),
          intervention: {
            kind: "inject_observation",
            payload: { text: "Surprise news event injected here.", fraction: 0.5 },
          },
        }),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={fork}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-xs hover:border-bg-4 disabled:opacity-60"
      title="Fork at the current tick with a surprise observation"
    >
      <GitBranch className="h-3 w-3" /> Branch here
    </button>
  );
}
