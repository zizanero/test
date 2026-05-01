import type {
  ActionMenuItem,
  AgentRuntime,
  DecisionResult,
  RunContext,
} from "./types";
import { complete } from "./llm";
import { retrieve } from "./memory";
import { hash32 } from "./rng";

// Build the menu of actions an agent can take this tick.
export function buildActionMenu(
  agent: AgentRuntime,
  ctx: RunContext,
): ActionMenuItem[] {
  const here = agent.currentLocationId;
  const items: ActionMenuItem[] = [];

  // Movement actions: nearest few locations (simple heuristic).
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

  // Speak: if any other agents co-located.
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

  // Wait
  items.push({
    id: "wait",
    kind: "wait",
    description: "pause and observe",
    prior: 0.2,
  });

  // Vote actions in deliberation phase
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

// Build the prompt the agent's LLM call sees.
function buildAgentPrompts(args: {
  agent: AgentRuntime;
  ctx: RunContext;
  recalled: { id: string; content: string }[];
  menu: ActionMenuItem[];
  observations: string[];
}) {
  const { agent, ctx, recalled, menu, observations } = args;
  const system = `You are ${agent.displayName}.

Identity: ${agent.proseIdentity}

Current goal: ${agent.goal ?? "(none)"}
Current location: ${ctx.locations.find((l) => l.id === agent.currentLocationId)?.name ?? "unknown"}
Tick: ${ctx.tick} of ${ctx.totalTicks}

You decide your next action by picking from the menu. Reply ONLY with JSON of the form:
{"actionId":"<id>","actionKind":"<kind>","actionDescription":"<desc>","actionParams":{...},"reasoning":"...","reasoningSummary":"<one sentence>"}.
Cite memories you used like [memory_id].`;

  const userParts: string[] = [];
  if (observations.length > 0) {
    userParts.push("Observations this tick:\n" + observations.map((o) => "- " + o).join("\n"));
  }
  if (recalled.length > 0) {
    userParts.push(
      "Recalled memories:\n" +
        recalled.map((m) => `[${m.id}] ${m.content}`).join("\n"),
    );
  }
  userParts.push(
    "Action menu:\n" +
      menu.map((m) => `- ${m.id}: ${m.description} (kind: ${m.kind})`).join("\n"),
  );
  userParts.push("Pick the best action and respond with JSON only.");
  return { system, user: userParts.join("\n\n") };
}

export async function stepAgent(
  agent: AgentRuntime,
  ctx: RunContext,
  observations: string[],
): Promise<DecisionResult> {
  // Build a query for retrieval from current goal + most-recent observations.
  const query =
    [agent.goal ?? "", ...observations.slice(-3)].filter(Boolean).join(" ") ||
    agent.proseIdentity.slice(0, 120);
  const recalled = await retrieve(agent.id, query, ctx, { k: 4 });
  const menu = buildActionMenu(agent, ctx);
  const prompts = buildAgentPrompts({
    agent,
    ctx,
    recalled: recalled.map((m) => ({ id: m.id, content: m.content })),
    menu,
    observations,
  });

  const seed = hash32(agent.id) ^ ctx.tick ^ ctx.seed;
  const out = await complete({
    kind: "decision",
    modelTier: agent.personality[1] > 0.7 ? "reflection" : "routine",
    system: prompts.system,
    user: prompts.user,
    seed,
    temperature: 0.6,
    meta: {
      agent,
      actionMenu: menu,
      retrievedMemoryIds: recalled.map((m) => m.id),
      location:
        ctx.locations.find((l) => l.id === agent.currentLocationId)?.name ?? "unknown",
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
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]) as {
        actionId?: string;
        actionKind?: ActionMenuItem["kind"];
        actionDescription?: string;
        actionParams?: Record<string, unknown>;
        reasoning?: string;
        reasoningSummary?: string;
      };
      const fallback = menu.find((x) => x.id === j.actionId) ?? menu[0];
      return {
        actionKind: (j.actionKind ?? fallback.kind) as ActionMenuItem["kind"],
        actionDescription: j.actionDescription ?? fallback.description,
        actionParams: j.actionParams ?? fallback.params,
        reasoning: j.reasoning ?? "(no reasoning)",
        reasoningSummary: j.reasoningSummary ?? fallback.description,
      };
    }
  } catch {
    /* fall through */
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
