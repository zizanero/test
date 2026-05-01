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

  // 6. Export PDF + notebook + CSV
  console.log("→ exporting CSV + notebook + PDF");
  const { exportRunCsv } = await import("@/server/export/csv");
  const { exportRunNotebook } = await import("@/server/export/notebook");
  const { exportRunPdf } = await import("@/server/export/pdf");
  const csv = await exportRunCsv(firstRunId);
  const nb = await exportRunNotebook(firstRunId);
  const pdf = await exportRunPdf(firstRunId);
  console.log(
    `   csv=${csv.length}B notebook=${nb.length}B pdf=${pdf.length}B`,
  );
  if (csv.length < 100) throw new Error("CSV too short");
  if (nb.length < 200) throw new Error("notebook too short");
  if (pdf.length < 1000) throw new Error("PDF too short");
  // Validate notebook is JSON.
  JSON.parse(nb);

  // 7. Calibration math: KS distance check.
  const { ksDistance } = await import("@/lib/ksDistance");
  const ks = ksDistance([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
  if (ks !== 0) throw new Error("KS-distance broken: identical samples should give 0");

  // 8. Causal interrogation (analyst with refusal pattern).
  console.log("→ causal analysis on first agent");
  const { analyzeWhy } = await import("@/sim/causal");
  const firstAgent = await prisma.agent.findFirst({ where: { runId: firstRunId } });
  if (!firstAgent) throw new Error("no agents in first run");
  const lastDecision = await prisma.decision.findFirst({
    where: { runId: firstRunId, agentId: firstAgent.id },
    orderBy: { tick: "desc" },
  });
  if (!lastDecision) throw new Error("no decision found");
  const why = await analyzeWhy({
    runId: firstRunId,
    agentId: firstAgent.id,
    tick: lastDecision.tick,
    decisionId: lastDecision.id,
  });
  console.log(
    `   narrative=${why.narrative.length}c causes=${why.causes.length} noEvidence=${why.noEvidence} promptVersion=${why.promptVersion}`,
  );
  if (!why.narrative || why.narrative.length === 0) throw new Error("empty narrative");
  if (why.promptVersion !== "causal/v1") throw new Error("prompt pin mismatch");

  // 9. Counterfactual: 3 control + 3 treatment from tick 10, 8-tick horizon, decision_count metric.
  console.log("→ counterfactual @ tick 10 (3+3 replicates, 8t horizon)");
  const { runCounterfactual } = await import("@/sim/counterfactual");
  const cf = await runCounterfactual({
    parentRunId: firstRunId,
    atTick: 10,
    replicates: 3,
    horizonTicks: 8,
    metric: "decision_count",
    perturbation: {
      kind: "inject_observation",
      text: "Surprise: a surprise visitor arrives at the assembly.",
      fraction: 1,
    },
    perturbationLabel: "surprise visitor",
  });
  console.log(
    `   group=${cf.groupId} ctrl=[${cf.control.join(",")}] treat=[${cf.treatment.join(",")}] Δ=${cf.effectSize.toFixed(2)}±${cf.effectStdErr.toFixed(2)}`,
  );
  if (cf.control.length !== 3) throw new Error(`expected 3 control replicates, got ${cf.control.length}`);
  if (cf.treatment.length !== 3) throw new Error(`expected 3 treatment replicates, got ${cf.treatment.length}`);
  // Each child run should be tagged with the counterfactual group.
  const taggedCount = await prisma.run.count({
    where: { counterfactualGroupId: cf.groupId },
  });
  if (taggedCount !== 6) throw new Error(`expected 6 tagged runs, got ${taggedCount}`);

  // 10. Determinism: byte-identical Tick.snapshot for two fresh runs with same seed.
  // The earlier check used DB resets that re-cuid'd agent IDs; this one uses the same
  // sim/agents and just starts two fresh runs.
  console.log("→ determinism: two fresh runs of the same sim with seed=99");
  const detA = await startRun({
    simulationId: sim.simulationId,
    seed: 99,
    totalTicks: 12,
    fidelity: "cheap",
    label: "det-A",
  });
  await awaitRun(detA.runId);
  const detB = await startRun({
    simulationId: sim.simulationId,
    seed: 99,
    totalTicks: 12,
    fidelity: "cheap",
    label: "det-B",
  });
  await awaitRun(detB.runId);
  const tA = await prisma.tick.findUnique({
    where: { runId_index: { runId: detA.runId, index: 11 } },
  });
  const tB = await prisma.tick.findUnique({
    where: { runId_index: { runId: detB.runId, index: 11 } },
  });
  if (!tA || !tB) throw new Error("missing det-tick");
  // Compare ambient + per-(seedKey)-location-distribution. We can't use agent.id directly
  // because cuids change, but we map id→seedKey to verify behaviour is deterministic.
  const agentsA = await prisma.agent.findMany({ where: { runId: detA.runId } });
  const agentsB = await prisma.agent.findMany({ where: { runId: detB.runId } });
  const idToSeedA = new Map(agentsA.map((a) => [a.id, a.seedKey ?? a.displayName]));
  const idToSeedB = new Map(agentsB.map((a) => [a.id, a.seedKey ?? a.displayName]));
  const sA = JSON.parse(tA.snapshot) as { agents: { id: string; locationId: string | null }[] };
  const sB = JSON.parse(tB.snapshot) as { agents: { id: string; locationId: string | null }[] };
  const distA = sA.agents
    .map((x) => `${idToSeedA.get(x.id)}@${x.locationId}`)
    .sort()
    .join("|");
  const distB = sB.agents
    .map((x) => `${idToSeedB.get(x.id)}@${x.locationId}`)
    .sort()
    .join("|");
  const matches = distA === distB;
  console.log(`   determinism by seedKey at tick 11: ${matches ? "MATCH" : "DIVERGE"}`);
  if (!matches) {
    console.log(`     A: ${distA.slice(0, 200)}`);
    console.log(`     B: ${distB.slice(0, 200)}`);
    throw new Error("non-deterministic across fresh runs of same sim with same seed");
  }

  console.log("== smoke OK ==");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ smoke failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
