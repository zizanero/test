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
import {
  detectPhaseTransition,
  emptyPhaseState,
  type PhaseTransitionState,
} from "./emergence/phaseTransition";
import {
  detectIntentionsKmeans,
  emptyIntentionsState,
  type IntentionsState,
} from "./emergence/intentionsKmeans";
import {
  detectCascade,
  emptyCascadeState,
  setCascadeSeed,
  type CascadeState,
} from "./emergence/percolation";
import { snapshot } from "./snapshot";
import { recordCost, exceededCap } from "./cost";
import { publish } from "./runners/eventBus";
import { mulberry32 } from "./rng";
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

  // Detector states (kept across ticks within a single loop invocation).
  const phaseState: PhaseTransitionState = emptyPhaseState();
  const intentionsState: IntentionsState = emptyIntentionsState();
  const cascadeState: CascadeState = emptyCascadeState();
  // Track per-agent recent action share for the intentions detector.
  const actionShareWindow = new Map<string, number[][]>(); // agentId -> rolling 5-vec
  const ACTION_KINDS = ["move", "speak", "wait", "act", "vote"] as const;
  const verbosity = (run.narrationVerbosity as "terse" | "narrative" | "cinematic") ?? "terse";

  for (let tick = run.currentTick; tick < run.totalTicks; tick++) {
    if (options.abortSignal?.aborted) break;
    ctx.tick = tick;

    await applyScheduledEvents(run.simulationId, ctx);

    // If any pendingObservation was just injected (from a rule), seed the
    // cascade detector with the most-recent observation text.
    for (const [, texts] of ctx.pendingObservations) {
      const t = texts[texts.length - 1];
      if (t && !cascadeState.seedEmbedding) {
        setCascadeSeed(cascadeState, t, tick);
        await prisma.marker.create({
          data: {
            runId,
            tick,
            kind: "intervention",
            label: `Cascade seed: "${t.slice(0, 60)}"`,
          },
        });
        break;
      }
    }

    const obs = computeObservations(ctx);

    const newMemoryIds: string[] = [];
    const newDecisionIds: string[] = [];

    // Shuffle agents deterministically per tick (run-stable: uses run.seed, not runId cuid).
    const shuffleRng = mulberry32(run.seed ^ tick ^ 0xC0FFEE);
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

      // Track action share window for the intentions-kmeans detector.
      const window = actionShareWindow.get(agent.id) ?? new Array(5).fill(0);
      const idx = ACTION_KINDS.indexOf(decision.action.kind);
      if (idx >= 0) window[idx] += 1;
      actionShareWindow.set(agent.id, window);

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

    // Game master arbitration + narration (verbosity from run config).
    const gm = await arbitrate(ctx, verbosity);
    for (const m of gm.markers) {
      await prisma.marker.create({
        data: { runId, tick, kind: m.kind, label: m.label },
      });
    }

    // Emergence: 4 detectors run continuously.
    let emergenceJson: string | null = null;
    if (tick > 0 && tick % EMERGENCE_INTERVAL === 0) {
      const detectorOutputs: Record<string, unknown> = {};

      // Community detection (Louvain).
      const rels = await prisma.relationship.findMany({
        where: { runId },
        select: { fromAgentId: true, toAgentId: true, weight: true },
      });
      const community = detectCommunities(
        ctx.agents.map((a) => a.id),
        rels.map((r) => ({ from: r.fromAgentId, to: r.toAgentId, weight: r.weight })),
      );
      detectorOutputs.community = community;
      if (community.communities >= 2) {
        await emitMarker(runId, tick, "emergence", `${community.communities} communities (mod=${community.modularity.toFixed(2)})`);
      }

      // Phase transition (belief variance ratio).
      const beliefVectors = ctx.agents.map((a) =>
        Object.values(a.beliefs).length > 0 ? Object.values(a.beliefs) : [0],
      );
      const phase = detectPhaseTransition(beliefVectors, phaseState);
      detectorOutputs.phase = phase;
      if (phase.fired) {
        await emitMarker(runId, tick, "emergence", `phase transition (ratio=${phase.ratio.toFixed(2)})`);
      }

      // Intentions k-means (regime shift in agent action mix).
      const intentVectors = ctx.agents.map((a) => {
        const w = actionShareWindow.get(a.id) ?? new Array(5).fill(0);
        const sum = w.reduce((s, x) => s + x, 0);
        if (sum === 0) return new Array(5).fill(0.2);
        return w.map((x) => x / sum);
      });
      const intentions = detectIntentionsKmeans(intentVectors, intentionsState);
      detectorOutputs.intentions = intentions;
      if (intentions.fired) {
        await emitMarker(
          runId,
          tick,
          "emergence",
          `intention regime shift (k=${intentions.k}, sizes=[${intentions.clusterSizes.join(",")}])`,
        );
      }

      // Percolation cascade (information spread).
      const recentMems = await prisma.memory.findMany({
        where: { runId, tick: { gte: Math.max(0, tick - 5) } },
        select: { agentId: true, embedding: true },
        take: 1000,
      });
      const grouped = new Map<string, number[][]>();
      for (const m of recentMems) {
        const arr = grouped.get(m.agentId) ?? [];
        try {
          arr.push(JSON.parse(m.embedding) as number[]);
        } catch {
          /* skip */
        }
        grouped.set(m.agentId, arr);
      }
      const agentEmbs = ctx.agents.map((a) => ({
        agentId: a.id,
        embeddings: grouped.get(a.id) ?? [],
      }));
      const cascade = detectCascade(agentEmbs, cascadeState);
      detectorOutputs.cascade = cascade;
      if (cascade.fired) {
        await emitMarker(
          runId,
          tick,
          "emergence",
          `cascade: ${(cascade.reach * 100).toFixed(0)}% reach (Δ ${(cascade.velocity * 100).toFixed(0)}%)`,
        );
      }

      emergenceJson = JSON.stringify(detectorOutputs);
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

async function emitMarker(
  runId: string,
  tick: number,
  kind: string,
  label: string,
): Promise<void> {
  await prisma.marker.create({ data: { runId, tick, kind, label } });
  publish({ type: "marker", runId, tick, kind, label });
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
    seedKey: a.seedKey ?? a.displayName,
    displayName: a.displayName,
    proseIdentity: a.proseIdentity,
    structured: parseJson(a.structured),
    beliefs: parseJson(a.beliefs) as Record<string, number>,
    goal: a.goal,
    currentLocationId: a.currentLocationId,
    status: (a.status as "alive" | "dead") ?? "alive",
    personality: derivePersonality(a.seedKey ?? a.displayName, a.proseIdentity),
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
