import { nanoid } from "nanoid";
import { prisma } from "@/server/db";
import { startRun, awaitRun } from "./runners/runManager";

// DIVERT-style counterfactual: fork at a tick with a perturbation, run N
// replicates with different seeds, return the outcome distribution.
//
// Outcome metrics implemented in MVP:
//   - "decision_count": how many decisions in the remaining window
//   - "speak_count":   how many speak actions
//   - "vote_yes_share": share of vote actions that were "yes" (deliberation)
//   - "ambient_topic": mean abs(level) of a named ambient topic at end-tick

export type Perturbation =
  | { kind: "inject_observation"; text: string; fraction: number }
  | { kind: "mutate_ambient"; topic: string; delta: number };

export type Metric =
  | "decision_count"
  | "speak_count"
  | "vote_yes_share"
  | "ambient_topic";

export interface CounterfactualRequest {
  parentRunId: string;
  atTick: number;
  perturbation: Perturbation | null; // null = control replicate (re-run with new seed only)
  replicates: number; // typically 5–20
  horizonTicks?: number; // ticks to run after the junction
  metric: Metric;
  metricArg?: string;
  perturbationLabel?: string;
}

export interface CounterfactualResult {
  groupId: string;
  parentRunId: string;
  atTick: number;
  perturbationLabel: string;
  replicates: number;
  metric: Metric;
  control: number[];     // metric value per control replicate
  treatment: number[];   // metric value per perturbed replicate
  controlMean: number;
  treatmentMean: number;
  effectSize: number;    // (treatmentMean - controlMean)
  effectStdErr: number;
  // childRunIds[i].kind = "control" | "treatment"
  childRunIds: { id: string; kind: "control" | "treatment"; seed: number }[];
}

const MAX_REPLICATES = 24;
const DEFAULT_HORIZON = 30;

export async function runCounterfactual(
  req: CounterfactualRequest,
): Promise<CounterfactualResult> {
  const replicates = Math.min(MAX_REPLICATES, Math.max(1, req.replicates));
  const groupId = "cf_" + nanoid(8);
  const horizon = req.horizonTicks ?? DEFAULT_HORIZON;
  const perturbLabel = req.perturbationLabel ?? labelFor(req.perturbation);

  const parent = await prisma.run.findUnique({
    where: { id: req.parentRunId },
    select: { simulationId: true, totalTicks: true, costCap: true, seed: true, costUsd: true },
  });
  if (!parent) throw new Error("parent run not found");

  // Per-replicate cost cap: if parent had one, divide it; else cap at $0.50.
  const perReplicateCap = parent.costCap ? parent.costCap / (replicates * 2) : 0.5;
  const targetTicks = Math.min(parent.totalTicks, req.atTick + horizon);

  // For perturbed replicates, append a one-shot RuleEvent at atTick+1.
  let perturbRuleId: string | null = null;
  if (req.perturbation) {
    const rule = await prisma.ruleEvent.create({
      data: {
        simulationId: parent.simulationId,
        name: `[CF ${groupId}] ${perturbLabel}`,
        triggerKind: "tick",
        triggerSpec: JSON.stringify({ atTick: req.atTick + 1 }),
        effect: JSON.stringify(perturbationToEffect(req.perturbation)),
      },
    });
    perturbRuleId = rule.id;
  }

  // Boot replicates in parallel. Each gets a unique seed = parent.seed XOR replicate index XOR group hash.
  const childRunIds: CounterfactualResult["childRunIds"] = [];
  const startedAll: Promise<{ runId: string }>[] = [];
  for (let i = 0; i < replicates; i++) {
    const ctrlSeed = parent.seed ^ ((i + 1) * 0x9e3779b9);
    startedAll.push(
      startRun({
        simulationId: parent.simulationId,
        seed: ctrlSeed,
        totalTicks: targetTicks,
        costCap: perReplicateCap,
        label: `[CF ${groupId} control #${i}]`,
        parentRunId: req.parentRunId,
        branchedAtTick: req.atTick,
      }).then((r) => {
        childRunIds.push({ id: r.runId, kind: "control", seed: ctrlSeed });
        return r;
      }),
    );
  }
  if (req.perturbation) {
    for (let i = 0; i < replicates; i++) {
      const trSeed = parent.seed ^ ((i + 1) * 0x9e3779b9) ^ 0xdeadbeef;
      startedAll.push(
        startRun({
          simulationId: parent.simulationId,
          seed: trSeed,
          totalTicks: targetTicks,
          costCap: perReplicateCap,
          label: `[CF ${groupId} treat #${i}]`,
          parentRunId: req.parentRunId,
          branchedAtTick: req.atTick,
        }).then((r) => {
          childRunIds.push({ id: r.runId, kind: "treatment", seed: trSeed });
          return r;
        }),
      );
    }
  }

  const started = await Promise.all(startedAll);

  // Tag the runs as part of this counterfactual group.
  await Promise.all(
    started.map((s) =>
      prisma.run.update({
        where: { id: s.runId },
        data: { counterfactualGroupId: groupId, perturbationLabel: perturbLabel },
      }),
    ),
  );

  // Wait for all to finish.
  await Promise.all(started.map((s) => awaitRun(s.runId)));

  // Clean up the one-shot rule (we don't want it firing on future re-runs).
  if (perturbRuleId) {
    await prisma.ruleEvent.delete({ where: { id: perturbRuleId } }).catch(() => {});
  }

  // Compute the metric per replicate.
  const control: number[] = [];
  const treatment: number[] = [];
  for (const c of childRunIds) {
    const v = await computeMetric(c.id, req.metric, req.metricArg, req.atTick);
    if (c.kind === "control") control.push(v);
    else treatment.push(v);
  }
  const controlMean = mean(control);
  const treatmentMean = treatment.length ? mean(treatment) : controlMean;
  const effectSize = treatmentMean - controlMean;
  const effectStdErr = pooledStdErr(control, treatment);

  return {
    groupId,
    parentRunId: req.parentRunId,
    atTick: req.atTick,
    perturbationLabel: perturbLabel,
    replicates,
    metric: req.metric,
    control,
    treatment,
    controlMean,
    treatmentMean,
    effectSize,
    effectStdErr,
    childRunIds,
  };
}

function perturbationToEffect(p: Perturbation): {
  kind: string;
  payload: Record<string, unknown>;
} {
  if (p.kind === "inject_observation")
    return {
      kind: "inject_observation",
      payload: { text: p.text, fraction: p.fraction },
    };
  return {
    kind: "mutate_ambient",
    payload: { topic: p.topic, delta: p.delta },
  };
}

function labelFor(p: Perturbation | null): string {
  if (!p) return "control";
  if (p.kind === "inject_observation") return `inject "${p.text.slice(0, 40)}" (${p.fraction})`;
  return `ambient "${p.topic}" ${p.delta >= 0 ? "+" : ""}${p.delta}`;
}

async function computeMetric(
  runId: string,
  metric: Metric,
  metricArg: string | undefined,
  fromTick: number,
): Promise<number> {
  if (metric === "decision_count") {
    return prisma.decision.count({ where: { runId, tick: { gt: fromTick } } });
  }
  if (metric === "speak_count") {
    const decs = await prisma.decision.findMany({
      where: { runId, tick: { gt: fromTick } },
      select: { action: true },
    });
    return decs.filter((d) => {
      try {
        const a = JSON.parse(d.action) as { kind: string };
        return a.kind === "speak";
      } catch {
        return false;
      }
    }).length;
  }
  if (metric === "vote_yes_share") {
    const decs = await prisma.decision.findMany({
      where: { runId, tick: { gt: fromTick } },
      select: { action: true },
    });
    let yes = 0;
    let total = 0;
    for (const d of decs) {
      try {
        const a = JSON.parse(d.action) as { kind: string; params?: { choice?: string } };
        if (a.kind === "vote") {
          total++;
          if (a.params?.choice === "yes") yes++;
        }
      } catch {
        // skip
      }
    }
    return total === 0 ? 0 : yes / total;
  }
  if (metric === "ambient_topic") {
    const lastTick = await prisma.tick.findFirst({
      where: { runId },
      orderBy: { index: "desc" },
      select: { snapshot: true },
    });
    if (!lastTick) return 0;
    try {
      const snap = JSON.parse(lastTick.snapshot) as { ambient: Record<string, number> };
      const topic = metricArg ?? "";
      return Math.abs(snap.ambient?.[topic] ?? 0);
    } catch {
      return 0;
    }
  }
  return 0;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pooledStdErr(a: number[], b: number[]): number {
  if (a.length < 2 && b.length < 2) return 0;
  const va = variance(a);
  const vb = variance(b);
  return Math.sqrt(va / Math.max(1, a.length) + vb / Math.max(1, b.length));
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}
