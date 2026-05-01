"use client";

interface Rule {
  id: string;
  name: string;
  triggerKind: string;
  triggerSpec: string;
  effect: string;
}

export function RulesLayer({ rules }: { rules: Rule[] }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Rules</h1>
      <p className="mb-6 max-w-2xl text-md text-ink-2">
        Scheduled events and conditions. In v1, these become a visual Blueprints
        graph — for MVP, they ship as a structured list.
      </p>
      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-bg-3 px-4 py-8 text-center text-xs text-ink-3">
          No rules.
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="rounded-lg border border-bg-3 bg-bg-1 p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-md font-medium">{r.name}</h2>
                <span className="rounded bg-bg-3 px-1.5 py-0.5 text-2xs uppercase text-ink-2">
                  {r.triggerKind}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-2xs">
                <Field label="Trigger spec" value={pretty(r.triggerSpec)} />
                <Field label="Effect" value={pretty(r.effect)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pretty(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-2xs uppercase tracking-wider text-ink-3">
        {label}
      </div>
      <pre className="overflow-auto rounded-md border border-bg-3 bg-bg-2 p-2 font-mono text-2xs text-ink-1">
        {value}
      </pre>
    </div>
  );
}
