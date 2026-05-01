import type {
  ActionMenuItem,
  AgentRuntime,
  DecisionResult,
  RunContext,
} from "./types";
import { complete } from "./llm";
import { retrieve } from "./memory";
import { hash32 } from "./rng";
import {
  renderDecisionPrompt,
  DECISION_PROMPT_VERSION,
} from "./llm/prompts";
import { DecisionSchema, extractJson } from "./llm/parser";

// Build the menu of actions an agent can take this tick.
export function buildActionMenu(
  agent: AgentRuntime,
  ctx: RunContext,
): ActionMenuItem[] {
  const here = agent.currentLocationId;
  const items: ActionMenuItem[] = [];

  const sorted = ctx.locations
    .filter((l) => l.kind !== "object" && l.id !== here)
    .map((l) => {
      const myLoc = ctx.locations.find((p) => p.id === here);
      const dx = (myLoc?.x ?? 0) - l.x;
      const dy = (myLoc?.y ?? 0) - l.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return { l, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4);
  for (const { l } of sorted) {
    items.push({
      id: `move:${l.id}`,
      kind: "move",
      description: `go to ${l.name}`,
      params: { locationId: l.id },
      prior: 0.4,
    });
  }

  const coLocated = (ctx.occupancy.get(here ?? "") ?? []).filter(
    (id) => id !== agent.id,
  );
  for (const peerId of coLocated.slice(0, 3)) {
    const peer = ctx.agents.find((a) => a.id === peerId);
    if (peer)
      items.push({
        id: `speak:${peerId}`,
        kind: "speak",
        description: `talk to ${peer.displayName}`,
        params: { peerId },
        prior: 0.6,
      });
  }

  items.push({
    id: "wait",
    kind: "wait",
    description: "pause and observe",
    prior: 0.2,
  });

  if (ctx.templateSlug === "deliberation" && ctx.tick >= 50) {
    items.push({
      id: "vote:yes",
      kind: "vote",
      description: "vote yes",
      params: { choice: "yes" },
      prior: 0.5,
    });
    items.push({
      id: "vote:no",
      kind: "vote",
      description: "vote no",
      params: { choice: "no" },
      prior: 0.5,
    });
  }

  return items;
}

export async function stepAgent(
  agent: AgentRuntime,
  ctx: RunContext,
  observations: string[],
): Promise<DecisionResult> {
  const query =
    [agent.goal ?? "", ...observations.slice(-3)].filter(Boolean).join(" ") ||
    agent.proseIdentity.slice(0, 120);
  const recalled = await retrieve(agent.id, query, ctx, { k: 4 });
  const menu = buildActionMenu(agent, ctx);
  const locationName =
    ctx.locations.find((l) => l.id === agent.currentLocationId)?.name ?? "unknown";

  const prompt = renderDecisionPrompt({
    agent,
    ctx: { tick: ctx.tick, totalTicks: ctx.totalTicks, locationName },
    recalled: recalled.map((m) => ({ id: m.id, content: m.content })),
    menu,
    observations,
  });

  const seed = hash32(agent.seedKey) ^ ctx.tick ^ ctx.seed;
  const out = await complete({
    kind: "decision",
    modelTier: agent.personality[1] > 0.7 ? "reflection" : "routine",
    promptName: prompt.promptName,
    promptVersion: prompt.promptVersion,
    system: prompt.system,
    user: prompt.user,
    seed,
    temperature: 0.6,
    meta: {
      agent,
      actionMenu: menu,
      retrievedMemoryIds: recalled.map((m) => m.id),
      location: locationName,
    },
  });

  const parsed = parseDecision(out.text, menu);
  return {
    reasoning: parsed.reasoning,
    reasoningSummary: parsed.reasoningSummary,
    retrievedMemoryIds: recalled.map((m) => m.id),
    action: {
      kind: parsed.actionKind,
      params: parsed.actionParams ?? {},
      description: parsed.actionDescription,
    },
    tokensIn: out.tokensIn,
    tokensOut: out.tokensOut,
    costUsd: out.costUsd,
    cached: out.cached,
    modelName: out.modelName,
    modelTier: agent.personality[1] > 0.7 ? "reflection" : "routine",
    durationMs: out.durationMs,
  };
}

function parseDecision(
  text: string,
  menu: ActionMenuItem[],
): {
  actionKind: ActionMenuItem["kind"];
  actionDescription: string;
  actionParams: Record<string, unknown> | undefined;
  reasoning: string;
  reasoningSummary: string;
} {
  const json = extractJson(text);
  const parsed = json !== null ? DecisionSchema.safeParse(json) : null;
  if (parsed?.success) {
    const j = parsed.data;
    const fallback = menu.find((x) => x.id === j.actionId) ?? menu[0];
    return {
      actionKind: (j.actionKind ?? fallback.kind) as ActionMenuItem["kind"],
      actionDescription: j.actionDescription ?? fallback.description,
      actionParams: j.actionParams ?? fallback.params,
      reasoning: j.reasoning ?? "(no reasoning)",
      reasoningSummary: j.reasoningSummary ?? fallback.description,
    };
  }
  const fb = menu[0] ?? {
    kind: "wait" as const,
    description: "wait",
    id: "wait",
  };
  return {
    actionKind: fb.kind,
    actionDescription: fb.description,
    actionParams: fb.params,
    reasoning: text.slice(0, 240) || "(unparseable)",
    reasoningSummary: fb.description,
  };
}

// Note: prompt name/version exported for callers that pin into specSnapshot.
export { DECISION_PROMPT_VERSION };
