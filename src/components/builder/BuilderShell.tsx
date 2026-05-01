"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

const layers = [
  { id: "population", label: "Population" },
  { id: "world", label: "World" },
  { id: "rules", label: "Rules" },
] as const;

export function BuilderShell({
  projectId,
  simId,
  layer,
  simName,
  children,
}: {
  projectId: string;
  simId: string;
  layer: "population" | "world" | "rules";
  simName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-bg-3 bg-bg-1 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}/simulations/${simId}/configure`}
            className="text-2xs uppercase tracking-wider text-ink-3 hover:text-accent"
          >
            ← Configure
          </Link>
          <span className="text-md font-medium tracking-tight">{simName}</span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-bg-3 bg-bg-2 p-0.5">
          {layers.map((L) => (
            <Link
              key={L.id}
              href={`/projects/${projectId}/simulations/${simId}/builder/${L.id}`}
              className={cn(
                "rounded px-2.5 py-1 text-xs",
                layer === L.id
                  ? "bg-accent text-accent-fg"
                  : "text-ink-2 hover:text-ink-1",
              )}
            >
              {L.label}
            </Link>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
