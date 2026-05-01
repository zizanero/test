"use client";

import { create } from "zustand";

export interface AgentDot {
  id: string;
  displayName: string;
  locationId: string | null;
  goal: string | null;
}

export interface Marker {
  tick: number;
  kind: string;
  label: string;
}

interface ObserverState {
  currentTick: number;
  totalTicks: number;
  isPlaying: boolean;
  speed: 0.25 | 1 | 4 | 16 | 64;
  agentsByTick: Map<number, AgentDot[]>;
  narrationByTick: Map<number, string>;
  markers: Marker[];
  selectedAgentId: string | null;
  pinnedAgentIds: string[];
  costUsd: number;
  status: string;
  setTick: (t: number) => void;
  pushTick: (tick: number, agents: AgentDot[]) => void;
  pushNarration: (tick: number, text: string) => void;
  pushMarker: (m: Marker) => void;
  pushCost: (delta: number, total: number) => void;
  setStatus: (s: string) => void;
  setIsPlaying: (b: boolean) => void;
  setSpeed: (s: ObserverState["speed"]) => void;
  selectAgent: (id: string | null) => void;
  togglePin: (id: string) => void;
  reset: () => void;
}

export const useObserverStore = create<ObserverState>((set) => ({
  currentTick: 0,
  totalTicks: 0,
  isPlaying: true,
  speed: 1,
  agentsByTick: new Map(),
  narrationByTick: new Map(),
  markers: [],
  selectedAgentId: null,
  pinnedAgentIds: [],
  costUsd: 0,
  status: "running",
  setTick: (t) => set({ currentTick: t }),
  pushTick: (tick, agents) =>
    set((s) => {
      const m = new Map(s.agentsByTick);
      m.set(tick, agents);
      return {
        agentsByTick: m,
        currentTick: Math.max(s.currentTick, tick),
        totalTicks: Math.max(s.totalTicks, tick + 1),
      };
    }),
  pushNarration: (tick, text) =>
    set((s) => {
      const m = new Map(s.narrationByTick);
      m.set(tick, text);
      return { narrationByTick: m };
    }),
  pushMarker: (m) => set((s) => ({ markers: [...s.markers, m] })),
  pushCost: (_delta, total) => set({ costUsd: total }),
  setStatus: (s) => set({ status: s }),
  setIsPlaying: (b) => set({ isPlaying: b }),
  setSpeed: (s) => set({ speed: s }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  togglePin: (id) =>
    set((s) => ({
      pinnedAgentIds: s.pinnedAgentIds.includes(id)
        ? s.pinnedAgentIds.filter((x) => x !== id)
        : [...s.pinnedAgentIds, id].slice(-4),
    })),
  reset: () =>
    set({
      currentTick: 0,
      totalTicks: 0,
      isPlaying: true,
      speed: 1,
      agentsByTick: new Map(),
      narrationByTick: new Map(),
      markers: [],
      selectedAgentId: null,
      pinnedAgentIds: [],
      costUsd: 0,
      status: "running",
    }),
}));
