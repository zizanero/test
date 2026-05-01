import { prisma } from "@/server/db";
import type { RunContext } from "./types";

// Apply RuleEvents whose trigger matches this tick.
//   - triggerKind = "tick" with triggerSpec = {atTick: N}
//   - effect.kind = "inject_observation" | "mutate_ambient" | "spawn_agent" | "message_agent"
export async function applyScheduledEvents(
  simulationId: string,
  ctx: RunContext,
): Promise<void> {
  const rules = await prisma.ruleEvent.findMany({ where: { simulationId } });
  for (const r of rules) {
    if (r.triggerKind !== "tick") continue;
    const spec = parseJson(r.triggerSpec) as { atTick?: number; everyN?: number };
    let fires = false;
    if (typeof spec.atTick === "number" && spec.atTick === ctx.tick) fires = true;
    if (typeof spec.everyN === "number" && spec.everyN > 0 && ctx.tick > 0 && ctx.tick % spec.everyN === 0)
      fires = true;
    if (!fires) continue;
    const eff = parseJson(r.effect) as unknown as RuleEffect;
    await applyEffect(eff, ctx);
  }
}

interface RuleEffect {
  kind: string;
  payload?: {
    text?: string;
    targetAgentClass?: string;
    targetAgentId?: string;
    topic?: string;
    delta?: number;
    fraction?: number;
  };
}

async function applyEffect(eff: RuleEffect, ctx: RunContext): Promise<void> {
  const p = eff.payload ?? {};
  switch (eff.kind) {
    case "inject_observation": {
      const text = p.text ?? "an event occurred";
      const fraction = typeof p.fraction === "number" ? p.fraction : 1;
      let agents = ctx.agents;
      if (p.targetAgentId) agents = agents.filter((a) => a.id === p.targetAgentId);
      if (p.targetAgentClass)
        agents = agents.filter((a) => a.classId === p.targetAgentClass);
      const cutoff = Math.ceil(agents.length * fraction);
      for (let i = 0; i < cutoff; i++) {
        const a = agents[i];
        const arr = ctx.pendingObservations.get(a.id) ?? [];
        arr.push(text);
        ctx.pendingObservations.set(a.id, arr);
      }
      return;
    }
    case "mutate_ambient": {
      const topic = p.topic ?? "ambient";
      const delta = typeof p.delta === "number" ? p.delta : 0.3;
      ctx.ambient[topic] = (ctx.ambient[topic] ?? 0) + delta;
      return;
    }
    default:
      return;
  }
}

function parseJson(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
