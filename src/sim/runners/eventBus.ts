// Tiny in-process pub/sub for SSE streaming.

type Listener = (event: BusEvent) => void;

export type BusEvent =
  | { type: "tick"; runId: string; tick: number; payload: TickPayload }
  | { type: "cost"; runId: string; tick: number; deltaUsd: number; totalUsd: number }
  | { type: "marker"; runId: string; tick: number; kind: string; label: string }
  | { type: "narration"; runId: string; tick: number; text: string }
  | { type: "status"; runId: string; status: string };

export interface TickPayload {
  agents: { id: string; locationId: string | null; goal: string | null; beliefs: Record<string, number> }[];
  newMemoryIds: string[];
  newDecisionIds: string[];
  emergence?: { communities: number };
}

const listeners = new Map<string, Set<Listener>>();

function key(runId: string) {
  return `run:${runId}`;
}

export function subscribe(runId: string, fn: Listener): () => void {
  const k = key(runId);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(fn);
  return () => listeners.get(k)?.delete(fn);
}

export function publish(event: BusEvent) {
  const k = key(event.runId);
  const subs = listeners.get(k);
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(event);
    } catch {
      // ignore subscriber errors
    }
  }
}
