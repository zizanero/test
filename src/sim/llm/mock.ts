import type {
  ActionMenuItem,
  AgentRuntime,
  LlmCallKind,
} from "@/sim/types";
import { hash32, mulberry32 } from "@/sim/rng";

// Deterministic mock LLM responses keyed by call kind.
// Inputs (system + user + seed) → output is a pure function.

interface MockInput {
  kind: LlmCallKind;
  system: string;
  user: string;
  seed: number;
  meta?: {
    agent?: AgentRuntime;
    actionMenu?: ActionMenuItem[];
    retrievedMemoryIds?: string[];
    location?: string;
  };
}

export interface MockOutput {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export function mockComplete(input: MockInput): MockOutput {
  // Seed depends ONLY on the caller-provided input.seed. Prompt text varies
  // across runs because it contains memory cuids; mixing it into the seed
  // would break run-level determinism for the engine.
  const rng = mulberry32(input.seed >>> 0);
  let text = "";
  switch (input.kind) {
    case "decision":
      text = mockDecision(input, rng);
      break;
    case "reflection":
      text = mockReflection(input, rng);
      break;
    case "narration":
      text = mockNarration(input, rng);
      break;
    case "importance_grade":
      text = mockImportance(input, rng);
      break;
    case "interview":
      text = mockInterview(input, rng);
      break;
    case "game_master":
      text = mockGameMaster(input, rng);
      break;
  }
  // Causal analysis is routed through "game_master" tier in production but the
  // prompt schema is recognizable: detect it and replace.
  if (
    input.kind === "game_master" &&
    /careful analyst|but-for causes|no_evidence/.test(input.system)
  ) {
    text = mockCausal(input, rng);
  }
  // Approximate token counts: chars/4.
  const tokensIn = Math.ceil((input.system.length + input.user.length) / 4);
  const tokensOut = Math.max(1, Math.ceil(text.length / 4));
  return { text, tokensIn, tokensOut };
}

function mockDecision(input: MockInput, rng: () => number): string {
  const menu = input.meta?.actionMenu ?? [];
  const agent = input.meta?.agent;
  const cited = (input.meta?.retrievedMemoryIds ?? []).slice(0, 3);
  let chosen: ActionMenuItem;
  if (menu.length === 0) {
    chosen = {
      id: "wait",
      description: "wait and observe",
      kind: "wait",
      prior: 1,
    };
  } else {
    // Weight by prior + personality alignment (deterministic).
    // Use kind+index+seedKey instead of m.id+agent.id, since both contain
    // cuids that change between fresh runs of the same simulation.
    const weights = menu.map((m, idx) => {
      let w = m.prior ?? 0.5;
      if (agent) {
        const persHash =
          (hash32(`${m.kind}:${idx}:${agent.seedKey}`) % 1000) / 1000; // 0..1
        const extraversion = agent.personality[2];
        if (m.kind === "speak") w += 0.6 * extraversion + 0.3 * persHash;
        if (m.kind === "move") w += 0.4 * agent.personality[0] + 0.2 * persHash;
        if (m.kind === "wait") w += 0.3 * (1 - extraversion);
        if (m.kind === "vote") w += 0.5 + 0.3 * agent.personality[1];
      }
      return Math.max(0.01, w);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    chosen = menu[0];
    for (let i = 0; i < menu.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = menu[i];
        break;
      }
    }
  }
  const summary = `${agent?.displayName ?? "I"} will ${chosen.description}.`;
  const memCitations =
    cited.length > 0
      ? `Based on ${cited.map((id) => `[${id}]`).join(", ")}, `
      : "";
  const reasoning = `${memCitations}I considered the situation at ${input.meta?.location ?? "my current location"}. ${summary}`;
  return JSON.stringify({
    actionId: chosen.id,
    actionKind: chosen.kind,
    actionDescription: chosen.description,
    actionParams: chosen.params ?? {},
    reasoning,
    reasoningSummary: summary,
  });
}

function mockReflection(input: MockInput, rng: () => number): string {
  // Expect user prompt to include a list of memories with their IDs.
  // We extract IDs and generate 3 templated insights citing 2–3 memories each.
  const ids = Array.from(input.user.matchAll(/\[([a-z0-9]{6,32})\]/g)).map(
    (m) => m[1],
  );
  const insights = [];
  const themes = [
    "I tend to gravitate toward people who share my goals",
    "Recent events have shifted what feels important to me",
    "My environment is shaping my decisions more than I realized",
    "I notice a pattern in how others react to me",
    "I am more uncertain than I was earlier",
  ];
  for (let i = 0; i < 3; i++) {
    const theme = themes[Math.floor(rng() * themes.length)];
    const evidence = ids
      .slice()
      .sort(() => rng() - 0.5)
      .slice(0, 3);
    insights.push({
      insight: theme,
      evidenceMemoryIds: evidence,
      importance: 4 + Math.floor(rng() * 5),
    });
  }
  return JSON.stringify({ insights });
}

function mockNarration(input: MockInput, _rng: () => number): string {
  const tickMatch = input.user.match(/tick[\s=:]?(\d+)/i);
  const tick = tickMatch ? tickMatch[1] : "?";
  const eventMatch = input.user.match(/event[s]?:?\s*([^\n]{0,120})/i);
  const events = eventMatch?.[1]?.trim() ?? "agents continue routines";
  return `T=${tick}: ${events}.`;
}

function mockImportance(input: MockInput, rng: () => number): string {
  const text = input.user.toLowerCase();
  let score = 2;
  if (/\b(love|hate|angry|happy|fear|sad|surprise|joy)\b/.test(text)) score += 2;
  if (/\b(decide|chose|chose|decision|plan)\b/.test(text)) score += 1;
  if (/\b(invite|invitation|party|meeting|election|vote)\b/.test(text)) score += 2;
  if (/\b(?:death|injury|fight|argue|crisis)\b/.test(text)) score += 3;
  score += Math.floor(rng() * 3);
  score = Math.max(1, Math.min(10, score));
  return JSON.stringify({ importance: score });
}

function mockInterview(input: MockInput, rng: () => number): string {
  const agentName = input.meta?.agent?.displayName ?? "the agent";
  const cited = (input.meta?.retrievedMemoryIds ?? []).slice(0, 3);
  const tone = ["Honestly,", "Well,", "Truthfully,"][Math.floor(rng() * 3)];
  const cite =
    cited.length > 0
      ? ` ${cited.map((id) => `[${id}]`).join(" and ")}`
      : "";
  return `${tone} I've been thinking about that a lot.${cite ? " I keep returning to" + cite + "." : ""} It's shaped how I see things.`;
}

function mockGameMaster(input: MockInput, _rng: () => number): string {
  return JSON.stringify({
    arbitration: "no_conflict",
    worldUpdates: [],
    note: "Tick proceeds normally.",
  });
}

function mockCausal(input: MockInput, rng: () => number): string {
  const memIds = Array.from(input.user.matchAll(/\[([a-z0-9]{8,32})\]\s/g)).map((m) => m[1]);
  const neighborhoodSection = input.user.match(/Neighborhood agents:\n([\s\S]*?)(?:\n\n|$)/);
  const agentIds = neighborhoodSection
    ? Array.from(neighborhoodSection[1].matchAll(/\[([a-z0-9]{8,32})\]/g)).map((m) => m[1])
    : [];
  const tickRefs = Array.from(input.user.matchAll(/\[t:(\d+)\]/g))
    .map((m) => m[1])
    .slice(0, 4);
  if (memIds.length === 0 && agentIds.length === 0) {
    return JSON.stringify({
      narrative: "no causal evidence found in trace",
      causes: [],
      no_evidence: true,
    });
  }
  const top = memIds.slice(0, 3);
  const ag = agentIds.slice(0, 2);
  const tickCite = tickRefs.length ? `[t:${tickRefs[0]}]` : "";
  const narrative = `Based on the recalled context ${top.map((id) => `[m:${id}]`).join(" and ")}${ag.length ? `, with ${ag.map((id) => `[a:${id}]`).join(" and ")} present` : ""}${tickCite ? ` ${tickCite}` : ""}, the agent's choice follows from the recent observation pattern. The retrieved memories provide the only causal link available in this trace.`;
  const causes: {
    label: string;
    confidence: number;
    evidenceMemoryIds: string[];
    evidenceAgentIds: string[];
    perturbation: string;
  }[] = [
    {
      label: "Recently retrieved memory shaped attention",
      confidence: 0.55 + rng() * 0.2,
      evidenceMemoryIds: top,
      evidenceAgentIds: [],
      perturbation: top.length
        ? `What if memory [m:${top[0]}] were never formed?`
        : "What if the most-recent observation didn't occur?",
    },
  ];
  if (ag.length > 0) {
    causes.push({
      label: "Co-located agent influence",
      confidence: 0.4 + rng() * 0.2,
      evidenceMemoryIds: [],
      evidenceAgentIds: ag,
      perturbation: `What if agent [a:${ag[0]}] were elsewhere this tick?`,
    });
  }
  return JSON.stringify({ narrative, causes, no_evidence: false });
}
