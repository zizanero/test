// Percolation-style cascade detector.
//
// When an external observation (news article, intervention) is injected to a
// fraction of agents at tick T, this detector measures whether the *idea*
// spreads through the population's memory store at later ticks. It scans
// recent memories for cosine similarity to the seed observation embedding.

import { embed, cosine } from "../embeddings";

export interface CascadeResult {
  fired: boolean;
  reach: number; // fraction of agents whose recent memories show the topic
  velocity: number; // delta reach since last call
  confidence: number;
}

export interface CascadeState {
  // Seed embedding being tracked. Populated once an intervention with a text
  // payload fires; cleared when reach decays back to zero.
  seedEmbedding: number[] | null;
  seedTick: number;
  lastReach: number;
}

export function emptyCascadeState(): CascadeState {
  return { seedEmbedding: null, seedTick: -1, lastReach: 0 };
}

export function setCascadeSeed(state: CascadeState, text: string, tick: number): void {
  state.seedEmbedding = embed(text);
  state.seedTick = tick;
  state.lastReach = 0;
}

const RELEVANCE_THRESHOLD = 0.35;
const REACH_THRESHOLD = 0.25;

export function detectCascade(
  agentRecentMemories: { agentId: string; embeddings: number[][] }[],
  state: CascadeState,
): CascadeResult {
  if (!state.seedEmbedding) return { fired: false, reach: 0, velocity: 0, confidence: 0 };
  let touched = 0;
  for (const a of agentRecentMemories) {
    const hit = a.embeddings.some(
      (e) => cosine(state.seedEmbedding!, e) >= RELEVANCE_THRESHOLD,
    );
    if (hit) touched++;
  }
  const reach = agentRecentMemories.length === 0 ? 0 : touched / agentRecentMemories.length;
  const velocity = reach - state.lastReach;
  const fired = reach >= REACH_THRESHOLD && state.lastReach < REACH_THRESHOLD;
  state.lastReach = reach;
  const confidence = fired ? Math.min(1, (reach - REACH_THRESHOLD) / (1 - REACH_THRESHOLD)) : 0;
  return { fired, reach, velocity, confidence };
}
