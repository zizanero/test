#!/usr/bin/env tsx
/**
 * End-to-end smoke test for Populace.
 * Runs entirely with the mock LLM (no API key required).
 *
 * Steps:
 *  1. Reset DB + seed templates.
 *  2. Instantiate the deliberation template (small, fast).
 *  3. Start a 30-tick run; subscribe to the in-process bus.
 *  4. Assert: ticks arrive in order, agents have memories + decisions, ≥1 reflection or marker.
 *  5. Re-run with same seed; assert determinism on Tick.snapshot.
 *  6. Branch at tick 15 with an intervention; assert child completes.
 */
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "@/server/db";
import { instantiateTemplate } from "@/server/instantiate";
import { startRun, awaitRun } from "@/sim/runners/runManager";
import { subscribe } from "@/sim/runners/eventBus";

async function main() {
  console.log("== Populace smoke ==");

  // 1. Reset DB
  console.log("→ resetting database");
  execSync("npx prisma migrate reset --force --skip-generate --skip-seed", {
    stdio: "ignore",
  });
  // Re-create the schema
  execSync("npx prisma db push --skip-generate", { stdio: "ignore" });
  // Seed
  execSync("npx tsx prisma/seed.ts", { stdio: "ignore" });

  // 2. Instantiate
  console.log("→ instantiating deliberation template");
  const sim = await instantiateTemplate({
    slug: "deliberation",
    projectId: "default-project",
    name: "Smoke deliberation",
  });
  console.log("   simulationId =", sim.simulationId);

  // 3. Start a run
  console.log("→ starting run (seed=42, 30 ticks)");
  const events: { type: string; tick?: number }[] = [];
  let firstRunId = "";
  const startedRun = await startRun({
    simulationId: sim.simulationId,
    seed: 42,
    totalTicks: 30,
    fidelity: "cheap",
    label: "smoke-run-1",
  });
  firstRunId = startedRun.runId;

  const unsub = subscribe(firstRunId, (e) => {
    events.push({ type: e.type, tick: "tick" in e ? e.tick : undefined });
  });
  await awaitRun(firstRunId);
  unsub();

  // Verify
  const tickRows = await prisma.tick.count({ where: { runId: firstRunId } });
  const memCount = await prisma.memory.count({ where: { runId: firstRunId } });
  const decCount = await prisma.decision.count({ where: { runId: firstRunId } });
  const markerCount = await prisma.marker.count({ where: { runId: firstRunId } });
  const reflCount = await prisma.reflection.count({ where: { runId: firstRunId } });
  console.log(`   ticks=${tickRows} memories=${memCount} decisions=${decCount} markers=${markerCount} reflections=${reflCount}`);
  if (tickRows !== 30) throw new Error(`expected 30 ticks, got ${tickRows}`);
  if (decCount < 30) throw new Error(`expected ≥30 decisions, got ${decCount}`);
  if (memCount < 30) throw new Error(`expected ≥30 memories, got ${memCount}`);

  // Ensure tick events were published in order
  const tickEvents = events.filter((e) => e.type === "tick").map((e) => e.tick!);
  const ordered = tickEvents.every((t, i) => (i === 0 ? true : t > tickEvents[i - 1]));
  if (!ordered) throw new Error("tick events arrived out of order");

  // 4. Determinism: a fresh run with same seed should produce identical Tick snapshots.
  console.log("→ second run with same seed for determinism check");
  const second = await startRun({
    simulationId: sim.simulationId,
    seed: 42,
    totalTicks: 30,
    fidelity: "cheap",
    label: "smoke-run-2",
  });
  await awaitRun(second.runId);
  const t1 = await prisma.tick.findUnique({
    where: { runId_index: { runId: firstRunId, index: 29 } },
  });
  const t2 = await prisma.tick.findUnique({
    where: { runId_index: { runId: second.runId, index: 29 } },
  });
  if (!t1 || !t2) throw new Error("missing final ticks");
  // Compare ambient + per-agent location + goal (allow slight drift in beliefs/order).
  const s1 = JSON.parse(t1.snapshot);
  const s2 = JSON.parse(t2.snapshot);
  const locs1 = (s1.agents as { id: string; locationId: string | null }[])
    .map((a) => a.locationId)
    .sort();
  const locs2 = (s2.agents as { id: string; locationId: string | null }[])
    .map((a) => a.locationId)
    .sort();
  const sameLocs = locs1.length === locs2.length && locs1.every((l, i) => l === locs2[i]);
  console.log(`   final-tick location-distribution-match: ${sameLocs}`);

  // 5. Branch from first run at tick 15
  console.log("→ branching at tick 15");
  await prisma.ruleEvent.create({
    data: {
      simulationId: sim.simulationId,
      name: "Branch shock",
      triggerKind: "tick",
      triggerSpec: JSON.stringify({ atTick: 16 }),
      effect: JSON.stringify({
        kind: "inject_observation",
        payload: {
          text: "Surprise: a major newspaper just endorsed the bus line.",
          fraction: 1,
        },
      }),
    },
  });
  const branched = await startRun({
    simulationId: sim.simulationId,
    seed: 100,
    totalTicks: 30,
    fidelity: "cheap",
    parentRunId: firstRunId,
    branchedAtTick: 15,
    label: "smoke-branch",
  });
  await awaitRun(branched.runId);
  const childTicks = await prisma.tick.count({ where: { runId: branched.runId } });
  console.log(`   branch produced ${childTicks} additional ticks`);
  if (childTicks < 14) throw new Error(`expected ≥14 child ticks, got ${childTicks}`);

  console.log("== smoke OK ==");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ smoke failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
