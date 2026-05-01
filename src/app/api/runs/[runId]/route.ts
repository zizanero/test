import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { pauseRun, resumeRun } from "@/sim/runners/runManager";

const Patch = z.object({
  action: z.enum(["pause", "resume"]),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      simulation: { select: { id: true, name: true, templateSlug: true } },
    },
  });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const body = Patch.parse(await req.json());
  if (body.action === "pause") await pauseRun(runId);
  else await resumeRun(runId);
  const run = await prisma.run.findUnique({ where: { id: runId } });
  return NextResponse.json({ run });
}
