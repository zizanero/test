import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { subscribe, type BusEvent } from "@/sim/runners/eventBus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const url = new URL(req.url);
  const fromTick = url.searchParams.get("fromTick")
    ? Number(url.searchParams.get("fromTick"))
    : null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* closed */
        }
      };

      // Replay history if requested.
      if (typeof fromTick === "number") {
        const ticks = await prisma.tick.findMany({
          where: { runId, index: { gte: fromTick } },
          orderBy: { index: "asc" },
          take: 500,
        });
        for (const t of ticks) {
          const snap = JSON.parse(t.snapshot);
          send("tick", { tick: t.index, payload: { agents: snap.agents } });
          if (t.narration) send("narration", { tick: t.index, text: t.narration });
        }
      }

      // Send current run status.
      const run = await prisma.run.findUnique({ where: { id: runId } });
      if (run) send("status", { runId, status: run.status });

      const unsub = subscribe(runId, (e: BusEvent) => {
        if (e.type === "tick") send("tick", { tick: e.tick, payload: e.payload });
        else if (e.type === "narration") send("narration", e);
        else if (e.type === "marker") send("marker", e);
        else if (e.type === "cost") send("cost", e);
        else if (e.type === "status") {
          send("status", e);
          if (e.status === "completed" || e.status === "failed") {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        }
      });

      const onClose = () => {
        unsub();
        try {
          controller.close();
        } catch {
          /* */
        }
      };
      req.signal.addEventListener("abort", onClose);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
