import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { startRun } from "@/sim/runners/runManager";

const Body = z.object({
  atTick: z.number().int().min(0),
  label: z.string().optional(),
  intervention: z
    .object({
      kind: z.literal("inject_observation"),
      payload: z.object({ text: z.string(), fraction: z.number().min(0).max(1).default(1) }),
    })
    .optional(),
  totalTicks: z.number().int().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const body = Body.parse(await req.json());
  const parent = await prisma.run.findUnique({ where: { id: runId } });
  if (!parent) return NextResponse.json({ error: "not found" }, { status: 404 });

  // If an intervention is specified, write it as a one-shot RuleEvent at atTick+1
  // scoped to a clone of the simulation? Simpler: append to existing simulation
  // (it's only triggered once because triggerSpec.atTick is exact).
  if (body.intervention) {
    await prisma.ruleEvent.create({
      data: {
        simulationId: parent.simulationId,
        name: `Branch intervention @${body.atTick + 1}`,
        triggerKind: "tick",
        triggerSpec: JSON.stringify({ atTick: body.atTick + 1 }),
        effect: JSON.stringify(body.intervention),
      },
    });
  }

  const out = await startRun({
    simulationId: parent.simulationId,
    seed: parent.seed + 1,
    totalTicks: body.totalTicks ?? parent.totalTicks,
    label: body.label ?? `branch @${body.atTick}`,
    parentRunId: runId,
    branchedAtTick: body.atTick,
  });
  return NextResponse.json(out);
}
