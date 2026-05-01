import { NextRequest, NextResponse } from "next/server";
import { exportRunCsv } from "@/server/export/csv";
import { exportRunNotebook } from "@/server/export/notebook";
import { exportRunPdf } from "@/server/export/pdf";
import { exportRunBundle } from "@/server/export/bundle";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; fmt: string }> },
) {
  const { runId, fmt } = await params;
  try {
    if (fmt === "csv") {
      const data = await exportRunCsv(runId);
      return new Response(data, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="run-${runId}.csv"`,
        },
      });
    }
    if (fmt === "notebook") {
      const data = await exportRunNotebook(runId);
      return new Response(data, {
        headers: {
          "content-type": "application/x-ipynb+json",
          "content-disposition": `attachment; filename="run-${runId}.ipynb"`,
        },
      });
    }
    if (fmt === "pdf") {
      const data = await exportRunPdf(runId);
      return new Response(new Uint8Array(data), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="run-${runId}.pdf"`,
        },
      });
    }
    if (fmt === "bundle") {
      const stream = await exportRunBundle(runId);
      return new Response(stream as unknown as ReadableStream, {
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="run-${runId}.zip"`,
        },
      });
    }
    return NextResponse.json({ error: "unknown fmt" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "export failed" },
      { status: 500 },
    );
  }
}
