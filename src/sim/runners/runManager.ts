import { prisma } from "@/server/db";
import { runRunLoop } from "@/sim/engine";
import { spawnAgentsForRun } from "@/server/instantiate";
import { PROMPT_VERSIONS } from "@/sim/llm/prompts";
import { env } from "@/lib/env";

interface ActiveRun {
  abort: AbortController;
  promise: Promise<void>;
}

const active = new Map<string, ActiveRun>();

export interface StartArgs {
  simulationId: string;
  seed?: number;
  totalTicks?: number;
  costCap?: number;
  label?: string;
  fidelity?: "cheap" | "balanced" | "high_fidelity";
  parentRunId?: string;
  branchedAtTick?: number;
  narrationVerbosity?: "terse" | "narrative" | "cinematic";
}

export async function startRun(args: StartArgs): Promise<{ runId: string }> {
  const sim = await prisma.simulation.findUnique({ where: { id: args.simulationId } });
  if (!sim) throw new Error("simulation not found");
  // Enrich spec snapshot with prompt + model pins for reproducibility.
  const baseSpec = JSON.parse(sim.spec) as Record<string, unknown>;
  const specSnapshot = JSON.stringify({
    ...baseSpec,
    pins: {
      promptVersions: PROMPT_VERSIONS,
      models: {
        routine: env.LLM_MODEL_ROUTINE,
        reflection: env.LLM_MODEL_REFLECTION,
        gameMaster: env.LLM_MODEL_GAMEMASTER,
      },
      llmMode: env.resolvedLlmMode,
      deterministic: env.SIM_DETERMINISTIC,
      embeddingDim: 32,
      memoryHalfLifeTicks: 24,
      reflectionThreshold: 150,
    },
  });

  const run = await prisma.run.create({
    data: {
      simulationId: sim.id,
      label: args.label ?? `${sim.name} run`,
      status: "queued",
      seed: args.seed ?? 42,
      totalTicks: args.totalTicks ?? 60,
      specSnapshot,
      costCap: args.costCap ?? null,
      parentRunId: args.parentRunId ?? null,
      branchedAtTick: args.branchedAtTick ?? null,
      narrationVerbosity: args.narrationVerbosity ?? "terse",
    },
  });

  if (args.parentRunId && typeof args.branchedAtTick === "number") {
    // Branching: copy agent state from parent at branchedAtTick.
    await branchAgents({
      parentRunId: args.parentRunId,
      childRunId: run.id,
      atTick: args.branchedAtTick,
    });
    await prisma.run.update({
      where: { id: run.id },
      data: { currentTick: args.branchedAtTick + 1 },
    });
  } else {
    await spawnAgentsForRun({ runId: run.id, simulationId: sim.id });
  }

  const abort = new AbortController();
  const promise = runRunLoop(run.id, {
    abortSignal: abort.signal,
    fidelity: args.fidelity ?? "balanced",
  })
    .catch(async (err) => {
      console.error(`run ${run.id} failed:`, err);
      await prisma.run.update({
        where: { id: run.id },
        data: { status: "failed", endedAt: new Date() },
      });
    })
    .finally(() => {
      active.delete(run.id);
    });

  active.set(run.id, { abort, promise });
  return { runId: run.id };
}

export function isActive(runId: string): boolean {
  return active.has(runId);
}

export async function pauseRun(runId: string): Promise<void> {
  const a = active.get(runId);
  if (a) a.abort.abort();
  await prisma.run.update({ where: { id: runId }, data: { status: "paused" } });
}

export async function resumeRun(runId: string): Promise<void> {
  if (active.has(runId)) return;
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) throw new Error("not found");
  if (run.status !== "paused") return;
  const abort = new AbortController();
  const promise = runRunLoop(runId, { abortSignal: abort.signal })
    .catch(async (err) => {
      console.error(`run ${runId} failed:`, err);
      await prisma.run.update({
        where: { id: runId },
        data: { status: "failed", endedAt: new Date() },
      });
    })
    .finally(() => active.delete(runId));
  active.set(runId, { abort, promise });
}

export async function awaitRun(runId: string): Promise<void> {
  const a = active.get(runId);
  if (a) await a.promise;
}

async function branchAgents(args: {
  parentRunId: string;
  childRunId: string;
  atTick: number;
}): Promise<void> {
  const tick = await prisma.tick.findUnique({
    where: { runId_index: { runId: args.parentRunId, index: args.atTick } },
  });
  if (!tick) throw new Error(`parent run has no tick ${args.atTick}`);
  const snap = JSON.parse(tick.snapshot) as {
    agents: { id: string; locationId: string | null; goal: string | null; beliefs: Record<string, number> }[];
  };
  const parentAgents = await prisma.agent.findMany({
    where: { runId: args.parentRunId },
  });
  for (const pa of parentAgents) {
    const snapAgent = snap.agents.find((s) => s.id === pa.id);
    await prisma.agent.create({
      data: {
        classId: pa.classId,
        runId: args.childRunId,
        seedKey: pa.seedKey,
        displayName: pa.displayName,
        proseIdentity: pa.proseIdentity,
        structured: pa.structured,
        currentLocationId: snapAgent?.locationId ?? pa.currentLocationId,
        beliefs: snapAgent ? JSON.stringify(snapAgent.beliefs) : pa.beliefs,
        goal: snapAgent?.goal ?? pa.goal,
        status: pa.status,
      },
    });
  }
}
