import PDFDocument from "pdfkit";
import { prisma } from "@/server/db";

// Server-side PDF generator using pdfkit. Returns a Buffer.
export async function exportRunPdf(runId: string): Promise<Buffer> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { simulation: { select: { name: true, templateSlug: true } } },
  });
  if (!run) throw new Error("not found");

  const decisions = await prisma.decision.findMany({
    where: { runId },
    select: { tick: true, action: true, modelName: true, costUsd: true },
    take: 5000,
  });
  const ticks = await prisma.tick.findMany({
    where: { runId },
    select: { index: true, narration: true },
    orderBy: { index: "asc" },
    take: 200,
  });
  const markers = await prisma.marker.findMany({
    where: { runId },
    select: { tick: true, kind: true, label: true },
    orderBy: { tick: "asc" },
    take: 200,
  });

  const decByTick: Record<number, number> = {};
  for (const d of decisions) decByTick[d.tick] = (decByTick[d.tick] ?? 0) + 1;
  const totalCost = decisions.reduce((s, d) => s + d.costUsd, 0);

  const doc = new PDFDocument({ size: "LETTER", margin: 60 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => {
    doc.on("end", () => resolve());
  });

  // Cover
  doc.fontSize(22).fillColor("#111").text(`Populace report`, { align: "left" });
  doc.moveDown(0.2);
  doc.fontSize(14).fillColor("#444").text(run.simulation.name);
  doc.moveDown();
  doc
    .fontSize(10)
    .fillColor("#666")
    .text(`Run ID: ${run.id}`)
    .text(`Template: ${run.simulation.templateSlug ?? "(custom)"}`)
    .text(`Seed: ${run.seed}`)
    .text(`Ticks: ${run.currentTick} / ${run.totalTicks}`)
    .text(`Status: ${run.status}`)
    .text(`Total cost: $${run.costUsd.toFixed(4)} (decisions only: $${totalCost.toFixed(4)})`)
    .text(`Started: ${run.startedAt?.toISOString() ?? "—"}`);
  doc.moveDown();

  // Summary chart (textual sparkline) of decisions per tick
  doc.fontSize(12).fillColor("#111").text("Decisions per tick");
  doc.moveDown(0.4);
  drawSparkline(doc, decByTick, run.totalTicks);
  doc.moveDown();

  // Markers
  doc.fontSize(12).fillColor("#111").text("Notable markers");
  doc.moveDown(0.4);
  if (markers.length === 0)
    doc.fontSize(10).fillColor("#666").text("(none)");
  else
    for (const m of markers.slice(0, 30)) {
      doc.fontSize(10).fillColor("#333").text(`T=${m.tick} · ${m.kind} · ${m.label}`);
    }
  doc.moveDown();

  // Narration log
  doc.addPage();
  doc.fontSize(14).fillColor("#111").text("Narration log", { underline: true });
  doc.moveDown(0.4);
  for (const t of ticks) {
    if (!t.narration) continue;
    doc
      .fontSize(9)
      .fillColor("#666")
      .text(`T=${t.index}`, { continued: true })
      .fillColor("#333")
      .text(`  ${t.narration}`);
  }

  // Methods appendix
  doc.addPage();
  doc.fontSize(14).fillColor("#111").text("Methods + reproducibility", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .fillColor("#333")
    .text(
      `This run was conducted with the Populace simulation engine. Memory follows the Park-style importance × recency × relevance retrieval; reflections are emitted when the sum of recent memory importance exceeds 150 within a 50-tick window. The Concordia-style game master arbitrates per-tick conflicts and produces narration. Random seed and immutable spec snapshot guarantee replicability.`,
    )
    .moveDown(0.5)
    .text(`Spec snapshot length: ${run.specSnapshot.length} bytes.`)
    .text(`To replicate, run: populace replicate <bundle.zip> (CLI ships v1).`);

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

function drawSparkline(
  doc: PDFKit.PDFDocument,
  decByTick: Record<number, number>,
  totalTicks: number,
) {
  const ticks = Array.from({ length: totalTicks }, (_, i) => decByTick[i] ?? 0);
  const max = Math.max(1, ...ticks);
  const w = 480;
  const h = 60;
  const x0 = 60;
  const y0 = doc.y + 4;
  doc.lineWidth(0.5).strokeColor("#aaa").rect(x0, y0, w, h).stroke();
  doc.lineWidth(1).strokeColor("#1f7a8c");
  doc.moveTo(x0, y0 + h - (ticks[0] / max) * h);
  ticks.forEach((v, i) => {
    const x = x0 + (i / Math.max(1, ticks.length - 1)) * w;
    const y = y0 + h - (v / max) * h;
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  });
  doc.stroke();
  doc.fillColor("#666").fontSize(8);
  doc.text(`max ${max}`, x0 + w - 50, y0 + 2);
  doc.y = y0 + h + 6;
}
