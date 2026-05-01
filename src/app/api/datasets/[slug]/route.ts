import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const dataset = await prisma.dataset.findUnique({ where: { slug } });
  if (!dataset) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ dataset });
}
