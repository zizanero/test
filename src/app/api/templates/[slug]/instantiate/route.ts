import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { instantiateTemplate } from "@/server/instantiate";

const Body = z.object({
  projectId: z.string().min(1).default("default-project"),
  name: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const body = Body.parse(await req.json().catch(() => ({})));
  const { slug } = await params;
  try {
    const out = await instantiateTemplate({ slug, ...body });
    return NextResponse.json(out);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "instantiate failed" },
      { status: 400 },
    );
  }
}
