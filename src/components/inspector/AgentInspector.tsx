"use client";

import { useEffect, useState } from "react";
import { useObserverStore } from "@/store/observerStore";
import { Pin, MessageSquare, ChevronDown, ChevronRight, Brain, Sparkles, Coins, Network, HelpCircle } from "lucide-react";
import { WhySheet } from "@/components/causal/WhySheet";

interface InspectorPayload {
  agent: {
    id: string;
    displayName: string;
    proseIdentity: string;
    className: string;
    currentLocationName: string | null;
    goal: string | null;
    status: string;
    beliefs: Record<string, number>;
  };
  memories: {
    id: string;
    tick: number;
    kind: string;
    content: string;
    importance: number;
    retrievalCount: number;
    lastRetrievedTick: number | null;
    parentIds: string[] | null;
  }[];
  decisions: {
    id: string;
    tick: number;
    reasoning: string;
    reasoningSummary: string | null;
    retrievedMemoryIds: string[];
    action: { kind: string; description: string; params: Record<string, unknown> };
    modelName: string;
    modelTier: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    cached: boolean;
  }[];
  reflections: {
    id: string;
    tick: number;
    insight: string;
    evidenceMemoryIds: string[];
    parentReflectionId: string | null;
    importance: number;
  }[];
  relationships: {
    toAgentId: string;
    toName: string;
    weight: number;
    kind: string;
    lastUpdatedTick: number;
  }[];
}

export function AgentInspector({
  runId,
  selectedAgentId,
  fallbackAgents,
}: {
  runId: string;
  selectedAgentId: string | null;
  fallbackAgents: { id: string; displayName: string; goal: string | null }[];
}) {
  const [data, setData] = useState<InspectorPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const togglePin = useObserverStore((s) => s.togglePin);
  const pinned = useObserverStore((s) => s.pinnedAgentIds);

  useEffect(() => {
    if (!selectedAgentId) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/agents/${selectedAgentId}`)
      .then((r) => r.json())
      .then((j) => setData(j as InspectorPayload))
      .finally(() => setLoading(false));
  }, [selectedAgentId, runId]);

  if (!selectedAgentId) {
    return (
      <div className="flex h-full flex-col p-3">
        <h3 className="mb-2 text-2xs uppercase tracking-wider text-ink-3">
          Agent Inspector
        </h3>
        <div className="rounded-md border border-dashed border-bg-3 px-3 py-8 text-center text-xs text-ink-3">
          Click an agent dot to inspect.
        </div>
        <div className="mt-3">
          <h4 className="mb-1 text-2xs uppercase tracking-wider text-ink-3">
            All agents ({fallbackAgents.length})
          </h4>
          <ul className="max-h-72 space-y-0.5 overflow-auto">
            {fallbackAgents.slice(0, 30).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded px-2 py-1 text-2xs text-ink-2 hover:bg-bg-2"
              >
                <span className="truncate">{a.displayName}</span>
                <button
                  type="button"
                  onClick={() => togglePin(a.id)}
                  className={`text-ink-3 hover:text-ink-1 ${pinned.includes(a.id) ? "text-warn" : ""}`}
                  title="Pin"
                >
                  <Pin className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="p-4 text-xs text-ink-3">Loading agent…</div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b border-bg-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-md font-medium leading-tight">{data.agent.displayName}</h3>
            <div className="mt-0.5 text-2xs text-ink-3">
              {data.agent.className} · {data.agent.currentLocationName ?? "no location"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => togglePin(data.agent.id)}
              title="Pin"
              className={`rounded p-1 text-ink-3 hover:bg-bg-2 ${pinned.includes(data.agent.id) ? "text-warn" : ""}`}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Interview (coming soon)"
              className="rounded p-1 text-ink-3 hover:bg-bg-2"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {data.agent.goal && (
          <div className="mt-2 rounded bg-bg-2 px-2 py-1 text-2xs text-ink-2">
            Goal: <span className="text-ink-1">{data.agent.goal}</span>
          </div>
        )}
      </header>

      <Section title="Identity" icon={<Brain className="h-3 w-3" />} defaultOpen>
        <p className="text-xs leading-relaxed text-ink-1">{data.agent.proseIdentity}</p>
      </Section>

      <Section title="State" defaultOpen>
        <dl className="grid grid-cols-2 gap-1 text-2xs">
          <dt className="text-ink-3">status</dt>
          <dd className="font-mono">{data.agent.status}</dd>
          <dt className="text-ink-3">location</dt>
          <dd className="font-mono">{data.agent.currentLocationName ?? "—"}</dd>
          {Object.entries(data.agent.beliefs).map(([k, v]) => (
            <Belief key={k} k={k} v={v} />
          ))}
        </dl>
      </Section>

      <Section
        title={`Last decision (${data.decisions[0]?.tick ?? "—"})`}
        icon={<Sparkles className="h-3 w-3 text-ai" />}
        defaultOpen
      >
        {data.decisions[0] ? (
          <>
            <DecisionView d={data.decisions[0]} memories={data.memories} />
            <button
              type="button"
              onClick={() => setWhyOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-2xs text-ink-1 hover:border-bg-4 hover:text-accent"
            >
              <HelpCircle className="h-3 w-3" />
              Why did {data.agent.displayName} do this?
            </button>
          </>
        ) : (
          <div className="text-2xs text-ink-3">No decisions yet.</div>
        )}
      </Section>

      {whyOpen && data.decisions[0] && (
        <WhySheet
          runId={runId}
          agentId={data.agent.id}
          agentName={data.agent.displayName}
          tick={data.decisions[0].tick}
          decisionId={data.decisions[0].id}
          onClose={() => setWhyOpen(false)}
        />
      )}

      <Section title={`Memory store (${data.memories.length})`}>
        <ul className="space-y-1">
          {data.memories.slice(0, 20).map((m) => (
            <li
              key={m.id}
              className="rounded border border-bg-3 bg-bg-2 px-2 py-1.5 text-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-ink-3">
                  [{m.id.slice(0, 6)}] T={m.tick}
                </span>
                <span className="flex items-center gap-1.5 text-ink-3">
                  <span title="importance" className="font-mono">
                    ★{m.importance.toFixed(0)}
                  </span>
                  {m.retrievalCount > 0 && (
                    <span title="retrieval count" className="rounded bg-bg-3 px-1 font-mono">
                      ↺{m.retrievalCount}
                    </span>
                  )}
                  {m.kind === "reflection" && (
                    <span className="rounded bg-ai/30 px-1 text-ai">refl</span>
                  )}
                </span>
              </div>
              <div className="mt-0.5 text-ink-1">{m.content}</div>
              {m.parentIds && m.parentIds.length > 0 && (
                <div className="mt-1 text-2xs text-ink-3">
                  because of {m.parentIds.map((p) => `[${p.slice(0, 6)}]`).join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Reflection tree (${data.reflections.length})`} icon={<Sparkles className="h-3 w-3 text-ai" />}>
        {data.reflections.length === 0 ? (
          <div className="text-2xs text-ink-3">No reflections yet.</div>
        ) : (
          <ReflectionTree reflections={data.reflections} />
        )}
      </Section>

      <Section
        title={`Relationships (${data.relationships.length})`}
        icon={<Network className="h-3 w-3" />}
      >
        {data.relationships.length === 0 ? (
          <div className="text-2xs text-ink-3">No edges yet.</div>
        ) : (
          <ul className="space-y-0.5">
            {data.relationships.map((r) => (
              <li
                key={r.toAgentId}
                className="flex items-center justify-between text-2xs"
              >
                <span className="text-ink-1">{r.toName}</span>
                <span
                  className="font-mono"
                  style={{
                    color:
                      r.weight > 0.2
                        ? "rgb(74,222,128)"
                        : r.weight < -0.2
                          ? "rgb(248,113,113)"
                          : "rgb(154,154,163)",
                  }}
                >
                  {r.weight >= 0 ? "+" : ""}
                  {r.weight.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Cost ledger" icon={<Coins className="h-3 w-3" />}>
        <CostLedger decisions={data.decisions} />
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  defaultOpen,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-bg-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-2xs uppercase tracking-wider text-ink-2 hover:bg-bg-2"
      >
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Belief({ k, v }: { k: string; v: number }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="font-mono">
        <span
          style={{
            color:
              v > 0.2 ? "rgb(74,222,128)" : v < -0.2 ? "rgb(248,113,113)" : "rgb(200,200,207)",
          }}
        >
          {v.toFixed(2)}
        </span>
      </dd>
    </>
  );
}

function DecisionView({
  d,
  memories,
}: {
  d: InspectorPayload["decisions"][number];
  memories: InspectorPayload["memories"];
}) {
  const [expanded, setExpanded] = useState(false);
  const refMems = memories.filter((m) => d.retrievedMemoryIds.includes(m.id));

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-bg-3 bg-bg-2 p-2 text-2xs">
        <div className="text-ink-3">summary</div>
        <div className="mt-0.5 text-ink-1">{d.reasoningSummary ?? d.reasoning.slice(0, 140)}</div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-2xs text-accent hover:underline"
        >
          {expanded ? "hide chain-of-thought" : "show chain-of-thought"}
        </button>
        {expanded && (
          <pre className="mt-2 whitespace-pre-wrap text-2xs text-ink-2">{d.reasoning}</pre>
        )}
      </div>
      {refMems.length > 0 && (
        <div className="rounded-md border border-bg-3 bg-bg-2 p-2 text-2xs">
          <div className="text-ink-3">retrieved memories</div>
          <ul className="mt-0.5 space-y-0.5">
            {refMems.map((m) => (
              <li key={m.id} className="text-ink-1">
                <span className="font-mono text-ink-3">[{m.id.slice(0, 6)}]</span>{" "}
                {m.content}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-md border border-bg-3 bg-bg-2 p-2 text-2xs">
        <div className="text-ink-3">action</div>
        <div className="mt-0.5 text-ink-1">
          <span className="rounded bg-bg-3 px-1 font-mono text-2xs">{d.action.kind}</span>{" "}
          {d.action.description}
        </div>
      </div>
      <div className="flex items-center gap-2 text-2xs text-ink-3">
        <span className="rounded bg-bg-3 px-1 font-mono">{d.modelName}</span>
        <span>tier={d.modelTier}</span>
        <span className="font-mono">in:{d.tokensIn} out:{d.tokensOut}</span>
        <span className="font-mono">${d.costUsd.toFixed(4)}</span>
        {d.cached && <span className="rounded bg-info/20 px-1 text-info">cached</span>}
      </div>
    </div>
  );
}

function ReflectionTree({
  reflections,
}: {
  reflections: InspectorPayload["reflections"];
}) {
  // Build child map.
  const byParent = new Map<string | null, typeof reflections>();
  for (const r of reflections) {
    const k = r.parentReflectionId ?? null;
    const arr = byParent.get(k) ?? [];
    arr.push(r);
    byParent.set(k, arr);
  }
  function Node({ r, depth }: { r: typeof reflections[number]; depth: number }) {
    const children = byParent.get(r.id) ?? [];
    return (
      <li className="ml-2">
        <div className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-2xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-ink-3">T={r.tick}</span>
            <span className="font-mono text-ink-3">★{r.importance.toFixed(0)}</span>
          </div>
          <div className="text-ink-1">{r.insight}</div>
          {r.evidenceMemoryIds.length > 0 && (
            <div className="mt-0.5 text-2xs text-ink-3">
              because of{" "}
              {r.evidenceMemoryIds.map((id) => `[${id.slice(0, 6)}]`).join(", ")}
            </div>
          )}
        </div>
        {children.length > 0 && depth < 3 && (
          <ul className="mt-1 border-l border-bg-3 pl-1">
            {children.map((c) => (
              <Node key={c.id} r={c} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }
  const roots = byParent.get(null) ?? [];
  return (
    <ul className="space-y-1">
      {roots.slice(0, 8).map((r) => (
        <Node key={r.id} r={r} depth={0} />
      ))}
    </ul>
  );
}

function CostLedger({
  decisions,
}: {
  decisions: InspectorPayload["decisions"];
}) {
  const total = decisions.reduce((s, d) => s + d.costUsd, 0);
  return (
    <div className="text-2xs">
      <div className="mb-1 flex items-center justify-between text-ink-3">
        <span>last {decisions.length} decisions</span>
        <span className="font-mono text-ink-1">${total.toFixed(4)}</span>
      </div>
      <ul className="space-y-0.5">
        {decisions.slice(0, 8).map((d) => (
          <li key={d.id} className="flex items-center justify-between font-mono text-ink-2">
            <span>T={d.tick}</span>
            <span>{d.tokensIn}+{d.tokensOut}</span>
            <span>${d.costUsd.toFixed(5)}</span>
            {d.cached && <span className="text-info">·cached</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
