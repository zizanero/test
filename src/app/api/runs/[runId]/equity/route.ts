import { NextRequest, NextResponse } from "next/server";
import { computeEquity } from "@/server/equity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  try {
    const report = await computeEquity(runId);
    return NextResponse.json(report);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "equity failed" },
      { status: 400 },
    );
  }
}
