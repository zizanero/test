import { prisma } from "@/server/db";
import { complete } from "./llm";
import { renderCausalPrompt } from "./llm/prompts";
import { CausalSchema, extractJson } from "./llm/parser";
import { retrieve } from "./memory";

export interface CausalCause {
  label: string;
  confidence: number;
  evidenceMemoryIds: string[];
  evidenceAgentIds: string[];
  perturbation: string;
}

export interface CausalAnalysis {
  narrative: string;
  causes: CausalCause[];
  noEvidence: boolean;
  retrievedMemoryIds: string[];
  retrievedAgentIds: string[];
  promptVersion: string;
  modelName: string;
  costUsd: number;
}

// Refusal-to-hallucinate analyst: gathers evidence first, then asks the LLM
// to explain the event citing only provided memories/agents/ticks.
export async function analyzeWhy(args: {
  runId: string;
  agentId: string;
  tick: number; // tick of the decision in question
  decisionId?: string;
}): Promise<CausalAnalysis> {
  const decision = args.decisionId
    ? await prisma.decision.findUnique({ where: { id: args.decisionId } })
    : await prisma.decision.findFirst({
        where: { agentId: args.agentId, runId: args.runId, tick: args.tick },
        orderBy: { tick: "desc" },
      });
  if (!decision) {
    return {
      narrative: "no causal evidence found in trace (no decision recorded)",
      causes: [],
      noEvidence: true,
      retrievedMemoryIds: [],
      retrievedAgentIds: [],
      promptVersion: "causal/v1",
      modelName: "n/a",
      costUsd: 0,
    };
  }

  const action = JSON.parse(decision.action) as { kind: string; description: string };
  const eventDescription = `Agent decided to ${action.kind}: ${action.description} at tick ${decision.tick}.`;

  // Surrounding narration ±30 ticks
  const tickWindow = await prisma.tick.findMany({
    where: { runId: args.runId, index: { gte: decision.tick - 30, lte: decision.tick + 30 } },
    orderBy: { index: "asc" },
    select: { index: true, narration: true },
  });
  const surroundingNarration = tickWindow
    .filter((t) => t.narration)
    .map((t) => `[t:${t.index}] ${t.narration}`)
    .join("\n");

  // Retrieved memories at decision time
  const retrievedIds = JSON.parse(decision.retrievedMemoryIds) as string[];
  const retrievedMemoryRows = retrievedIds.length
    ? await prisma.memory.findMany({ where: { id: { in: retrievedIds } } })
    : [];

  // Co-located agents at decision time (neighborhood)
  const lastTick = await prisma.tick.findFirst({
    where: { runId: args.runId, index: { lte: decision.tick } },
    orderBy: { index: "desc" },
    select: { snapshot: true },
  });
  const neighborhoodIds = pickNeighborhood(
    lastTick?.snapshot,
    args.agentId,
  );
  const retrievedAgents = neighborhoodIds.length
    ? await prisma.agent.findMany({
        where: { id: { in: neighborhoodIds } },
        select: { id: true, displayName: true, proseIdentity: true },
      })
    : [];

  const prompt = renderCausalPrompt({
    eventDescription,
    surroundingNarration,
    retrievedMemories: retrievedMemoryRows.map((m) => ({ id: m.id, content: m.content })),
    retrievedAgents: retrievedAgents.map((a) => ({
      id: a.id,
      name: a.displayName,
      proseIdentity: a.proseIdentity,
    })),
  });

  const out = await complete({
    kind: "game_master", // analyst-LLM uses GM tier (Sonnet)
    modelTier: "gameMaster",
    promptName: prompt.promptName,
    promptVersion: prompt.promptVersion,
    seed: decision.tick * 7919,
    temperature: 0.2,
    system: prompt.system,
    user: prompt.user,
  });

  const json = extractJson(out.text);
  const parsed = json !== null ? CausalSchema.safeParse(json) : null;

  if (!parsed?.success) {
    // Refusal fallback: be honest the structured output failed.
    return {
      narrative: `no causal evidence found in trace (analyst output unparseable). Raw: ${out.text.slice(0, 240)}`,
      causes: [],
      noEvidence: true,
      retrievedMemoryIds: retrievedIds,
      retrievedAgentIds: neighborhoodIds,
      promptVersion: prompt.promptVersion,
      modelName: out.modelName,
      costUsd: out.costUsd,
    };
  }

  // Filter causes: keep only those with at least one evidence citation
  // pointing into our actual retrieved set (refusal-to-hallucinate).
  const validMemIds = new Set(retrievedIds);
  const validAgentIds = new Set(neighborhoodIds);
  const filteredCauses = parsed.data.causes.filter((c) => {
    const memHit = c.evidenceMemoryIds.some((id) => validMemIds.has(id));
    const agentHit = c.evidenceAgentIds.some((id) => validAgentIds.has(id));
    return memHit || agentHit;
  });

  return {
    narrative:
      parsed.data.no_evidence || filteredCauses.length === 0
        ? parsed.data.narrative + " (no falsifiable causes survived the evidence filter.)"
        : parsed.data.narrative,
    causes: filteredCauses,
    noEvidence: parsed.data.no_evidence || filteredCauses.length === 0,
    retrievedMemoryIds: retrievedIds,
    retrievedAgentIds: neighborhoodIds,
    promptVersion: prompt.promptVersion,
    modelName: out.modelName,
    costUsd: out.costUsd,
  };
}

function pickNeighborhood(snapshotJson: string | undefined, agentId: string): string[] {
  if (!snapshotJson) return [];
  try {
    const snap = JSON.parse(snapshotJson) as {
      agents: { id: string; locationId: string | null }[];
    };
    const me = snap.agents.find((a) => a.id === agentId);
    if (!me?.locationId) return [];
    return snap.agents
      .filter((a) => a.locationId === me.locationId && a.id !== agentId)
      .map((a) => a.id)
      .slice(0, 6);
  } catch {
    return [];
  }
}
