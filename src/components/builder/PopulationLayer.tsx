"use client";

import { useState } from "react";

interface AgentClass {
  id: string;
  name: string;
  count: number;
  proseIdentity: string;
  modelTier: string;
}

export function PopulationLayer({
  simId,
  classes,
}: {
  simId: string;
  classes: AgentClass[];
}) {
  const [activeId, setActiveId] = useState<string | null>(classes[0]?.id ?? null);
  const active = classes.find((c) => c.id === activeId) ?? null;
  return (
    <div className="grid h-full grid-cols-[260px,1fr,360px]">
      <aside className="overflow-auto border-r border-bg-3 bg-bg-1 p-3">
        <h2 className="mb-2 text-2xs uppercase tracking-wider text-ink-3">
          Agent classes ({classes.length})
        </h2>
        <ul className="space-y-0.5">
          {classes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                  activeId === c.id
                    ? "bg-bg-3 text-ink-0"
                    : "text-ink-1 hover:bg-bg-2"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{c.name}</span>
                  <span className="text-2xs text-ink-3">×{c.count}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="overflow-auto bg-bg-0 p-6">
        <div className="mx-auto max-w-2xl">
          {active ? (
            <>
              <h1 className="text-lg font-semibold tracking-tight">{active.name}</h1>
              <p className="mt-1 text-2xs text-ink-3">
                {active.count} {active.count === 1 ? "agent" : "agents"} · model tier {active.modelTier}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {Array.from({ length: Math.min(active.count, 50) }).map((_, i) => (
                  <span
                    key={i}
                    title={`${active.name} #${i + 1}`}
                    className="block h-3 w-3 rounded-full bg-ink-2"
                  />
                ))}
                {active.count > 50 && (
                  <span className="text-2xs text-ink-3">+ {active.count - 50} more</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-3">Select an agent class.</p>
          )}
        </div>
      </section>
      <aside className="overflow-auto border-l border-bg-3 bg-bg-1 p-3">
        {active ? (
          <PersonaDesigner key={active.id} cls={active} />
        ) : (
          <div className="text-2xs text-ink-3">No class selected.</div>
        )}
      </aside>
    </div>
  );
}

function PersonaDesigner({ cls }: { cls: AgentClass }) {
  const [prose, setProse] = useState(cls.proseIdentity);
  return (
    <div>
      <h3 className="text-2xs uppercase tracking-wider text-ink-3">Persona designer</h3>
      <p className="mt-2 text-2xs text-ink-3">
        Prose mode is the source of truth. Use slash commands like{" "}
        <code className="rounded bg-bg-3 px-1 font-mono">/age</code>,{" "}
        <code className="rounded bg-bg-3 px-1 font-mono">/big_five</code>,{" "}
        <code className="rounded bg-bg-3 px-1 font-mono">/relationships</code>.
      </p>
      <textarea
        className="mt-3 h-64 w-full rounded-md border border-bg-3 bg-bg-2 p-2 text-xs leading-relaxed text-ink-1 focus:border-accent focus:outline-none"
        value={prose}
        onChange={(e) => setProse(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-between text-2xs text-ink-3">
        <span>{prose.length} chars</span>
        <button
          type="button"
          className="rounded-md border border-bg-3 bg-bg-2 px-2 py-1 hover:border-bg-4"
          disabled
          title="Save (post-MVP wiring)"
        >
          Save
        </button>
      </div>
    </div>
  );
}
