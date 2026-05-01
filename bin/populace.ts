#!/usr/bin/env tsx
/**
 * Populace CLI seed.
 *
 * Usage:
 *   populace replicate <bundle.zip>     # re-run a Populace replication bundle
 *   populace run <template-slug>        # quick-run a built-in template
 *   populace status                     # list recent runs
 *
 * Engine and Prisma client are imported from the same monorepo, so this CLI
 * is a thin wrapper rather than a separately-published package. v1 deferred:
 * extracting the engine into @populace/core and shipping a real npm package.
 */
import { open as openZip } from "yauzl";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";

import { prisma } from "@/server/db";
import { startRun, awaitRun } from "@/sim/runners/runManager";
import { instantiateTemplate } from "@/server/instantiate";

async function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  if (!cmd) return printUsage();
  switch (cmd) {
    case "replicate":
      if (!arg) return printUsage();
      await replicate(arg);
      break;
    case "run":
      if (!arg) return printUsage();
      await runTemplate(arg);
      break;
    case "status":
      await status();
      break;
    case "--help":
    case "-h":
    case "help":
      return printUsage();
    default:
      console.error(`unknown command: ${cmd}`);
      printUsage();
      process.exit(1);
  }
}

function printUsage() {
  console.log(`populace v0.1 — LLM social-simulation CLI

Commands:
  populace replicate <bundle.zip>   re-run a Populace replication bundle
  populace run <template-slug>      run a built-in template (smallville, polarization, ...)
  populace status                   list recent runs
  populace help                     show this help`);
}

async function replicate(bundlePath: string): Promise<void> {
  const abs = path.resolve(bundlePath);
  console.log(`→ reading bundle ${abs}`);
  const files = await readZip(abs);
  const simJson = files.get("simulation.json");
  if (!simJson) throw new Error("bundle missing simulation.json");
  const spec = JSON.parse(simJson.toString("utf8")) as Record<string, unknown>;

  // Stash the spec into a fresh Simulation row.
  const ws = await prisma.workspace.upsert({
    where: { id: "default-workspace" },
    update: {},
    create: { id: "default-workspace", name: "Default workspace" },
  });
  const proj = await prisma.project.upsert({
    where: { id: "cli-replicate" },
    update: {},
    create: { id: "cli-replicate", workspaceId: ws.id, name: "CLI replicate" },
  });

  console.log(`→ rebuilding simulation`);
  const sim = await prisma.simulation.create({
    data: {
      projectId: proj.id,
      name: `replicated @ ${new Date().toISOString()}`,
      description: "Re-run from a replication bundle.",
      spec: JSON.stringify(spec),
    },
  });

  // Best-effort: rebuild population/world/rules from spec if those keys are present.
  await reconstructFromSpec(sim.id, spec);

  // Seed agents and run.
  const totalTicks =
    typeof (spec as { scenario?: { totalTicks?: number } }).scenario?.totalTicks === "number"
      ? ((spec as { scenario: { totalTicks: number } }).scenario.totalTicks as number)
      : 30;
  const seed =
    typeof (spec as { scenario?: { defaultSeed?: number } }).scenario?.defaultSeed === "number"
      ? ((spec as { scenario: { defaultSeed: number } }).scenario.defaultSeed as number)
      : 42;

  console.log(`→ starting run (seed=${seed}, ${totalTicks} ticks)`);
  const { runId } = await startRun({
    simulationId: sim.id,
    seed,
    totalTicks,
    fidelity: "cheap",
    label: "cli-replicate",
  });
  await awaitRun(runId);

  const finalRun = await prisma.run.findUnique({ where: { id: runId } });
  const ticks = await prisma.tick.count({ where: { runId } });
  const decisions = await prisma.decision.count({ where: { runId } });
  console.log(
    `✓ replication complete: runId=${runId} ticks=${ticks} decisions=${decisions} cost=$${finalRun?.costUsd.toFixed(4) ?? "0"}`,
  );
  await prisma.$disconnect();
}

async function reconstructFromSpec(
  simulationId: string,
  spec: Record<string, unknown>,
): Promise<void> {
  type WorldSpec = {
    name: string;
    width: number;
    height: number;
    locations: { name: string; kind?: string; x: number; y: number; capacity?: number | null }[];
  };
  const world = spec.world as WorldSpec | undefined;
  const locByName: Record<string, string> = {};
  if (world && Array.isArray(world.locations)) {
    const w = await prisma.world.create({
      data: { simulationId, name: world.name, width: world.width, height: world.height },
    });
    for (const loc of world.locations) {
      const created = await prisma.location.create({
        data: {
          worldId: w.id,
          name: loc.name,
          kind: loc.kind ?? "area",
          x: loc.x,
          y: loc.y,
          capacity: loc.capacity ?? null,
        },
      });
      locByName[loc.name] = created.id;
    }
  }

  type PopulationSpec = {
    classes: {
      name: string;
      count: number;
      proseIdentity: string;
      modelTier?: string;
      structured?: Record<string, unknown>;
      initialLocationName?: string;
    }[];
  };
  const population = spec.population as PopulationSpec | undefined;
  if (population && Array.isArray(population.classes)) {
    const pop = await prisma.population.create({
      data: { simulationId, name: "Population" },
    });
    for (const cls of population.classes) {
      await prisma.agentClass.create({
        data: {
          populationId: pop.id,
          name: cls.name,
          count: cls.count,
          proseIdentity: cls.proseIdentity,
          structured: JSON.stringify(cls.structured ?? {}),
          modelTier: cls.modelTier ?? "auto",
        },
      });
    }
  }

  type RuleSpec = {
    name: string;
    triggerKind: string;
    triggerSpec: Record<string, unknown>;
    effect: Record<string, unknown>;
  };
  const rules = spec.rules as RuleSpec[] | undefined;
  if (rules && Array.isArray(rules)) {
    for (const r of rules) {
      await prisma.ruleEvent.create({
        data: {
          simulationId,
          name: r.name,
          triggerKind: r.triggerKind,
          triggerSpec: JSON.stringify(r.triggerSpec),
          effect: JSON.stringify(r.effect),
        },
      });
    }
  }
}

async function runTemplate(slug: string): Promise<void> {
  console.log(`→ instantiating template ${slug}`);
  const ws = await prisma.workspace.upsert({
    where: { id: "default-workspace" },
    update: {},
    create: { id: "default-workspace", name: "Default workspace" },
  });
  const proj = await prisma.project.upsert({
    where: { id: "cli-run" },
    update: {},
    create: { id: "cli-run", workspaceId: ws.id, name: "CLI runs" },
  });
  const { simulationId } = await instantiateTemplate({ slug, projectId: proj.id });
  console.log(`→ starting run`);
  const { runId } = await startRun({
    simulationId,
    seed: 42,
    totalTicks: 30,
    fidelity: "cheap",
    label: `cli-run ${slug}`,
  });
  await awaitRun(runId);
  const ticks = await prisma.tick.count({ where: { runId } });
  console.log(`✓ done: runId=${runId} ticks=${ticks}`);
  await prisma.$disconnect();
}

async function status(): Promise<void> {
  const runs = await prisma.run.findMany({
    orderBy: { startedAt: "desc" },
    take: 12,
    include: { simulation: { select: { name: true } } },
  });
  console.log("Recent runs:");
  for (const r of runs) {
    console.log(
      `  ${r.id.slice(0, 8)}  ${r.status.padEnd(10)}  ticks ${r.currentTick}/${r.totalTicks}  $${r.costUsd.toFixed(4)}  ${r.simulation.name}`,
    );
  }
  await prisma.$disconnect();
}

async function readZip(zipPath: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    openZip(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("could not open zip"));
      const out = new Map<string, Buffer>();
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) {
            zip.readEntry();
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
    });
  });
}

main().catch(async (e) => {
  console.error("✗ populace:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
