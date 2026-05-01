import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { startRun } from "@/sim/runners/runManager";

const Body = z.object({
  simulationId: z.string().min(1),
  seed: z.number().int().optional(),
  totalTicks: z.number().int().min(1).max(1000).optional(),
  costCap: z.number().nonnegative().optional(),
  label: z.string().optional(),
  fidelity: z.enum(["cheap", "balanced", "high_fidelity"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    const out = await startRun(body);
    return NextResponse.json(out);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "start failed" },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const simulationId = url.searchParams.get("simulationId");
  const runs = await prisma.run.findMany({
    where: simulationId ? { simulationId } : undefined,
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ runs });
}
