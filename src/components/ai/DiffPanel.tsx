"use client";

import { useState } from "react";
import { Check, X, Sparkles } from "lucide-react";

export interface DiffField {
  path: string;
  before: unknown;
  after: unknown;
}

export interface DiffPanelProps {
  title?: string;
  description?: string;
  fields: DiffField[];
  onAccept: (acceptedPaths: string[]) => void;
  onReject: () => void;
  busy?: boolean;
}

// Cursor-style red/green diff with selective accept. Reusable from any AI
// surface that mutates user data (scenario generator, persona suggestions,
// rule generator).
export function DiffPanel({
  title = "AI suggested changes",
  description,
  fields,
  onAccept,
  onReject,
  busy,
}: DiffPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(fields.map((f) => f.path)),
  );

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const acceptedCount = selected.size;
  const totalCount = fields.length;

  return (
    <div className="rounded-lg border border-bg-3 bg-bg-1 p-3">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ai">
            <Sparkles className="h-3 w-3" />
            {title}
          </div>
          {description && (
            <p className="mt-1 text-xs text-ink-2">{description}</p>
          )}
        </div>
        <div className="text-2xs font-mono text-ink-3">
          {acceptedCount}/{totalCount} selected
        </div>
      </header>
      <ul className="space-y-1.5">
        {fields.map((f) => {
          const isSel = selected.has(f.path);
          return (
            <li
              key={f.path}
              className="rounded-md border border-bg-3 bg-bg-2 p-2 text-2xs"
            >
              <div className="mb-1 flex items-center justify-between">
                <code className="font-mono text-ink-2">{f.path}</code>
                <button
                  type="button"
                  onClick={() => toggle(f.path)}
                  className={`rounded p-1 ${
                    isSel ? "bg-success/20 text-success" : "bg-bg-3 text-ink-3"
                  }`}
                  title={isSel ? "Deselect" : "Select"}
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ValueBlock label="before" value={f.before} negative />
                <ValueBlock label="after" value={f.after} positive />
              </div>
            </li>
          );
        })}
      </ul>
      <footer className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-bg-3 bg-bg-2 px-2.5 py-1 text-2xs hover:border-bg-4 disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          Reject all
        </button>
        <button
          type="button"
          onClick={() => onAccept(Array.from(selected))}
          disabled={busy || acceptedCount === 0}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-2xs font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          Apply {acceptedCount}
        </button>
      </footer>
    </div>
  );
}

function ValueBlock({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: unknown;
  positive?: boolean;
  negative?: boolean;
}) {
  const text = formatValue(value);
  return (
    <div
      className={`rounded p-1.5 ${
        positive
          ? "border border-success/30 bg-success/5"
          : negative
          ? "border border-danger/30 bg-danger/5"
          : "bg-bg-3"
      }`}
    >
      <div
        className={`text-2xs uppercase tracking-wider ${
          positive ? "text-success" : negative ? "text-danger" : "text-ink-3"
        }`}
      >
        {label}
      </div>
      <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-2xs text-ink-1">
        {text}
      </pre>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 200 ? v.slice(0, 200) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v, null, 2);
    return s.length > 240 ? s.slice(0, 240) + "…" : s;
  } catch {
    return "(unprintable)";
  }
}
