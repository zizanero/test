import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeWhy } from "@/sim/causal";

const Body = z.object({
  agentId: z.string().min(1),
  tick: z.number().int().min(0),
  decisionId: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  try {
    const body = Body.parse(await req.json());
    const result = await analyzeWhy({
      runId,
      agentId: body.agentId,
      tick: body.tick,
      decisionId: body.decisionId,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "why failed" },
      { status: 400 },
    );
  }
}
