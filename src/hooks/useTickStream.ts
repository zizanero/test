"use client";

import { useEffect } from "react";
import { useObserverStore } from "@/store/observerStore";

interface TickEventData {
  tick: number;
  payload: { agents: { id: string; locationId: string | null; goal: string | null }[] };
}
interface NarrationData {
  tick: number;
  text: string;
}
interface MarkerData {
  tick: number;
  kind: string;
  label: string;
}
interface StatusData {
  status: string;
}

export function useTickStream(runId: string, agentNames: Map<string, string>) {
  const pushTick = useObserverStore((s) => s.pushTick);
  const pushNarration = useObserverStore((s) => s.pushNarration);
  const pushMarker = useObserverStore((s) => s.pushMarker);
  const setStatus = useObserverStore((s) => s.setStatus);

  useEffect(() => {
    const url = `/api/runs/${runId}/stream?fromTick=0`;
    const es = new EventSource(url);

    es.addEventListener("tick", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as TickEventData;
      pushTick(
        d.tick,
        d.payload.agents.map((a) => ({
          id: a.id,
          displayName: agentNames.get(a.id) ?? a.id,
          locationId: a.locationId,
          goal: a.goal,
        })),
      );
    });

    es.addEventListener("narration", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as NarrationData;
      pushNarration(d.tick, d.text);
    });

    es.addEventListener("marker", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as MarkerData;
      pushMarker(d);
    });

    es.addEventListener("status", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as StatusData;
      setStatus(d.status);
    });

    es.addEventListener("error", () => {
      // Auto-reconnect handled by browser; nothing to do.
    });

    return () => es.close();
  }, [runId, agentNames, pushTick, pushNarration, pushMarker, setStatus]);
}
