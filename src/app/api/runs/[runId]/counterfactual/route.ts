import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCounterfactual, type Perturbation, type Metric } from "@/sim/counterfactual";

const Body = z.object({
  atTick: z.number().int().min(0),
  replicates: z.number().int().min(1).max(24).default(8),
  horizonTicks: z.number().int().min(1).max(200).optional(),
  metric: z
    .enum(["decision_count", "speak_count", "vote_yes_share", "ambient_topic"])
    .default("decision_count"),
  metricArg: z.string().optional(),
  perturbationLabel: z.string().optional(),
  perturbation: z
    .union([
      z.object({
        kind: z.literal("inject_observation"),
        text: z.string().min(1),
        fraction: z.number().min(0).max(1).default(1),
      }),
      z.object({
        kind: z.literal("mutate_ambient"),
        topic: z.string().min(1),
        delta: z.number(),
      }),
    ])
    .nullable()
    .default(null),
});

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  try {
    const body = Body.parse(await req.json());
    const result = await runCounterfactual({
      parentRunId: runId,
      atTick: body.atTick,
      replicates: body.replicates,
      horizonTicks: body.horizonTicks,
      metric: body.metric as Metric,
      metricArg: body.metricArg,
      perturbation: body.perturbation as Perturbation | null,
      perturbationLabel: body.perturbationLabel,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "counterfactual failed" },
      { status: 400 },
    );
  }
}
