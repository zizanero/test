import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lockPreregistration, readPreregistration } from "@/server/preregistration";

const Body = z.object({
  hypotheses: z.array(z.string().min(1)).min(1),
  primaryMetrics: z.array(z.string().min(1)).min(1),
  stopConditions: z
    .array(
      z.object({
        kind: z.enum(["tick_limit", "predicate", "manual"]),
        value: z.string().optional(),
      }),
    )
    .default([]),
  notes: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const rec = await readPreregistration(runId);
  return NextResponse.json({ preregistration: rec });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  try {
    const body = Body.parse(await req.json());
    const rec = await lockPreregistration(runId, body);
    return NextResponse.json({ preregistration: rec });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "preregister failed" },
      { status: 400 },
    );
  }
}
