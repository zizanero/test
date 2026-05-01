import { prisma } from "@/server/db";
import type {
  AgentRuntime,
  LocationRuntime,
  RunContext,
} from "./types";
import { applyScheduledEvents } from "./scheduler";
import { computeObservations } from "./perception";
import { stepAgent } from "./agent";
import { applyAction } from "./action";
import { ingestObservation } from "./memory";
import { generateReflection, shouldReflect } from "./reflection";
import { arbitrate } from "./gameMaster";
import { updateRelationships } from "./relationships";
import { detectCommunities } from "./emergence/communityDetection";
import { snapshot } from "./snapshot";
import { recordCost, exceededCap } from "./cost";
import { publish } from "./runners/eventBus";
import { mulberry32, hash32 } from "./rng";
import { derivePersonality } from "./personality";

const EMERGENCE_INTERVAL = 5;

export interface EngineOptions {
  abortSignal?: AbortSignal;
  fidelity?: "cheap" | "balanced" | "high_fidelity";
  deterministic?: boolean;
}

export async function runRunLoop(
  runId: string,
  options: EngineOptions = {},
): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { simulation: true },
  });
  if (!run) throw new Error(`Run ${runId} not found`);
  if (!["queued", "running", "paused"].includes(run.status))
    throw new Error(`Run ${runId} is ${run.status}, cannot start`);

  await prisma.run.update({
    where: { id: runId },
    data: { status: "running", startedAt: run.startedAt ?? new Date() },
  });
  publish({ type: "status", runId, status: "running" });

  const ctx = await hydrateContext(runId, options);

  for (let tick = run.currentTick; tick < run.totalTicks; tick++) {
    if (options.abortSignal?.aborted) break;
    ctx.tick = tick;

    await applyScheduledEvents(run.simulationId, ctx);

    const obs = computeObservations(ctx);

    const newMemoryIds: string[] = [];
    const newDecisionIds: string[] = [];

    // Shuffle agents deterministically per tick.
    const shuffleRng = mulberry32(hash32(runId) ^ tick);
    const order = ctx.agents
      .map((a) => ({ a, k: shuffleRng() }))
      .sort((x, y) => x.k - y.k)
      .map(({ a }) => a);

    for (const agent of order) {
      if (agent.status !== "alive") continue;
      // Ingest this tick's observations as memories first.
      const localObs = obs.get(agent.id) ?? [];
      for (const text of localObs) {
        const m = await ingestObservation({
          runId,
          agentId: agent.id,
          tick,
          content: text,
        });
        newMemoryIds.push(m.id);
      }
      // Decide.
      const decision = await stepAgent(agent, ctx, localObs);
      ctx.lastDecisions.set(agent.id, decision);

      // Apply action and propagate observations.
      const eff = applyAction(agent, decision.action, ctx);
      if (eff.observationForSelf) {
        const m = await ingestObservation({
          runId,
          agentId: agent.id,
          tick,
          content: eff.observationForSelf,
        });
        newMemoryIds.push(m.id);
      }
      for (const [otherId, text] of eff.observationsForOthers) {
        const arr = ctx.pendingObservations.get(otherId) ?? [];
        arr.push(text);
        ctx.pendingObservations.set(otherId, arr);
      }

      // Update relationships.
      await updateRelationships(agent.id, decision, ctx);

      // Persist decision.
      const created = await prisma.decision.create({
        data: {
          runId,
          agentId: agent.id,
          tick,
          retrievedMemoryIds: JSON.stringify(decision.retrievedMemoryIds),
          prompt: "(stored separately to keep DB compact)",
          promptVersion: "v1",
          modelTier: decision.modelTier,
          modelName: decision.modelName,
          reasoning: decision.reasoning,
          reasoningSummary: decision.reasoningSummary,
          action: JSON.stringify(decision.action),
          tokensIn: decision.tokensIn,
          tokensOut: decision.tokensOut,
          costUsd: decision.costUsd,
          cached: decision.cached,
          durationMs: decision.durationMs,
        },
      });
      newDecisionIds.push(created.id);

      await recordCost({
        runId,
        tick,
        agentId: agent.id,
        modelName: decision.modelName,
        tier: decision.modelTier,
        tokensIn: decision.tokensIn,
        tokensOut: decision.tokensOut,
        costUsd: decision.costUsd,
        cached: decision.cached,
      });

      // Reflect maybe.
      if (await shouldReflect(agent.id, runId, tick)) {
        const refs = await generateReflection({
          runId,
          agentId: agent.id,
          tick,
          agentName: agent.displayName,
          proseIdentity: agent.proseIdentity,
        });
        for (const r of refs) {
          await prisma.marker.create({
            data: {
              runId,
              tick,
              kind: "reflection",
              label: `${agent.displayName}: ${r.insight.slice(0, 60)}`,
            },
          });
        }
      }
    }

    // Game master arbitration + narration.
    const gm = await arbitrate(ctx);
    for (const m of gm.markers) {
      await prisma.marker.create({
        data: { runId, tick, kind: m.kind, label: m.label },
      });
    }

    // Emergence: community detection on the fly.
    let emergenceJson: string | null = null;
    if (tick > 0 && tick % EMERGENCE_INTERVAL === 0) {
      const rels = await prisma.relationship.findMany({
        where: { runId },
        select: { fromAgentId: true, toAgentId: true, weight: true },
      });
      const result = detectCommunities(
        ctx.agents.map((a) => a.id),
        rels.map((r) => ({ from: r.fromAgentId, to: r.toAgentId, weight: r.weight })),
      );
      emergenceJson = JSON.stringify(result);
      if (result.communities >= 2) {
        await prisma.marker.create({
          data: {
            runId,
            tick,
            kind: "emergence",
            label: `${result.communities} communities detected (mod=${result.modularity.toFixed(2)})`,
          },
        });
        publish({
          type: "marker",
          runId,
          tick,
          kind: "emergence",
          label: `${result.communities} communities`,
        });
      }
    }

    // Persist agent positions.
    await Promise.all(
      ctx.agents.map((a) =>
        prisma.agent.update({
          where: { id: a.id },
          data: {
            currentLocationId: a.currentLocationId,
            beliefs: JSON.stringify(a.beliefs),
            goal: a.goal,
          },
        }),
      ),
    );

    // Snapshot tick.
    const snap = snapshot(ctx);
    await prisma.tick.create({
      data: {
        runId,
        index: tick,
        snapshot: JSON.stringify(snap),
        narration: gm.narration,
        emergence: emergenceJson,
      },
    });
    await prisma.run.update({
      where: { id: runId },
      data: { currentTick: tick + 1 },
    });

    publish({
      type: "tick",
      runId,
      tick,
      payload: {
        agents: snap.agents,
        newMemoryIds,
        newDecisionIds,
      },
    });
    publish({ type: "narration", runId, tick, text: gm.narration });

    if (await exceededCap(runId)) {
      await prisma.run.update({
        where: { id: runId },
        data: { status: "paused" },
      });
      publish({ type: "status", runId, status: "paused" });
      await prisma.marker.create({
        data: { runId, tick, kind: "anomaly", label: "Cost cap reached; paused." },
      });
      return;
    }
  }

  await prisma.run.update({
    where: { id: runId },
    data: { status: "completed", endedAt: new Date() },
  });
  publish({ type: "status", runId, status: "completed" });
}

async function hydrateContext(
  runId: string,
  options: EngineOptions,
): Promise<RunContext> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { simulation: { include: { worlds: { include: { locations: true } } } } },
  });
  if (!run) throw new Error("run gone");

  const dbAgents = await prisma.agent.findMany({ where: { runId } });
  const allLocations = run.simulation.worlds.flatMap((w) => w.locations);

  const agents: AgentRuntime[] = dbAgents.map((a) => ({
    id: a.id,
    classId: a.classId,
    displayName: a.displayName,
    proseIdentity: a.proseIdentity,
    structured: parseJson(a.structured),
    beliefs: parseJson(a.beliefs) as Record<string, number>,
    goal: a.goal,
    currentLocationId: a.currentLocationId,
    status: (a.status as "alive" | "dead") ?? "alive",
    personality: derivePersonality(a.id, a.proseIdentity),
  }));

  const locations: LocationRuntime[] = allLocations.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    x: l.x,
    y: l.y,
    capacity: l.capacity,
    affordances: l.affordances ? (JSON.parse(l.affordances) as string[]) : [],
    parentId: l.parentId,
  }));

  const occupancy = new Map<string, string[]>();
  for (const l of locations) occupancy.set(l.id, []);
  for (const a of agents)
    if (a.currentLocationId) {
      const arr = occupancy.get(a.currentLocationId) ?? [];
      arr.push(a.id);
      occupancy.set(a.currentLocationId, arr);
    }

  return {
    runId,
    tick: run.currentTick,
    totalTicks: run.totalTicks,
    seed: run.seed,
    agents,
    locations,
    occupancy,
    ambient: {},
    templateSlug: run.simulation.templateSlug ?? null,
    pendingObservations: new Map(),
    lastDecisions: new Map(),
    fidelity: options.fidelity ?? "balanced",
    deterministic: options.deterministic ?? false,
  };
}

function parseJson<T = unknown>(s: string | null | undefined): T {
  if (!s) return {} as T;
  try {
    return JSON.parse(s) as T;
  } catch {
    return {} as T;
  }
}
