import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAbc } from "@/sim/calibration/abc";

const Body = z.object({
  targetDatasetSlug: z.string().min(1),
  numSamples: z.number().int().min(8).max(80).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  acceptTopFraction: z.number().min(0.05).max(0.5).optional(),
  parameterSpace: z
    .object({
      recencyW: z.tuple([z.number(), z.number()]),
      importanceW: z.tuple([z.number(), z.number()]),
      relevanceW: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  try {
    const body = Body.parse(await req.json());
    const result = await runAbc({ runId, ...body });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "abc failed" },
      { status: 400 },
    );
  }
}
