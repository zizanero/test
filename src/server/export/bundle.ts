import archiver from "archiver";
import { Readable } from "node:stream";
import { prisma } from "@/server/db";
import { exportRunCsv } from "./csv";
import { exportRunNotebook } from "./notebook";
import { exportRunPdf } from "./pdf";

export async function exportRunBundle(runId: string): Promise<Readable> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { simulation: { select: { name: true, templateSlug: true } } },
  });
  if (!run) throw new Error("not found");

  const csv = await exportRunCsv(runId);
  const notebook = await exportRunNotebook(runId);
  const pdf = await exportRunPdf(runId);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.append(JSON.stringify(JSON.parse(run.specSnapshot), null, 2), {
    name: "simulation.json",
  });
  archive.append(csv, { name: "data/decisions.csv" });
  archive.append(notebook, { name: "report.ipynb" });
  archive.append(pdf, { name: "report.pdf" });
  archive.append(
    `# ${run.simulation.name}\n\nRun ${run.id}. Seed ${run.seed}.\n\nIncludes:\n- simulation.json — immutable run spec snapshot\n- data/decisions.csv — per-decision long-format data\n- report.ipynb — Jupyter notebook reproducing summary plots\n- report.pdf — bundled PDF report\n\nTo replicate (post-MVP CLI): \\\`populace replicate bundle.zip\\\`\n`,
    { name: "README.md" },
  );
  archive.finalize();
  return archive as unknown as Readable;
}
