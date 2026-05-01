import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  const datasets = await prisma.dataset.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      title: true,
      source: true,
      category: true,
      description: true,
      metricKey: true,
      license: true,
    },
  });
  return NextResponse.json({ datasets });
}
