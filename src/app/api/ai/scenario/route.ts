import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { generateScenario } from "@/server/scenarioGenerator";

const Body = z.object({
  description: z.string().min(8).max(2000),
  seed: z.number().int().optional(),
  // If projectId is provided AND the user has accepted, instantiate immediately.
  apply: z.boolean().default(false),
  projectId: z.string().min(1).optional(),
});

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    const result = await generateScenario({
      description: body.description,
      seed: body.seed,
    });

    let simulationId: string | null = null;
    if (body.apply && result.ok && result.scenario && body.projectId) {
      simulationId = await applyGenerated(result.scenario, body.projectId);
    }

    return NextResponse.json({
      ok: result.ok,
      scenario: result.scenario,
      errors: result.errors,
      promptVersion: result.promptVersion,
      modelName: result.modelName,
      costUsd: result.costUsd,
      simulationId,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "scenario gen failed" },
      { status: 400 },
    );
  }
}

async function applyGenerated(
  scenario: import("@/sim/llm/parser").ScenarioGenerated,
  projectId: string,
): Promise<string> {
  const sim = await prisma.simulation.create({
    data: {
      projectId,
      name: scenario.title,
      description: scenario.description,
      templateSlug: null,
      spec: JSON.stringify({
        population: scenario.population,
        world: scenario.world,
        rules: scenario.rules,
        scenario: scenario.scenario,
      }),
      provenance: JSON.stringify({ aiGenerated: true }),
    },
  });

  const world = await prisma.world.create({
    data: {
      simulationId: sim.id,
      name: scenario.world.name,
      width: scenario.world.width,
      height: scenario.world.height,
    },
  });
  const locByName: Record<string, string> = {};
  for (const loc of scenario.world.locations) {
    const created = await prisma.location.create({
      data: {
        worldId: world.id,
        name: loc.name,
        kind: loc.kind,
        x: loc.x,
        y: loc.y,
        capacity: loc.capacity ?? null,
        affordances: null,
      },
    });
    locByName[loc.name] = created.id;
  }

  const pop = await prisma.population.create({
    data: { simulationId: sim.id, name: "Population" },
  });
  for (const cls of scenario.population.classes) {
    await prisma.agentClass.create({
      data: {
        populationId: pop.id,
        name: cls.name,
        count: cls.count,
        proseIdentity: cls.proseIdentity,
        structured: JSON.stringify({
          initialBeliefs: cls.initialBeliefs ?? {},
          initialGoal: cls.initialGoal ?? null,
          initialLocationName: cls.initialLocationName,
        }),
        modelTier: "auto",
      },
    });
  }

  for (const r of scenario.rules) {
    await prisma.ruleEvent.create({
      data: {
        simulationId: sim.id,
        name: r.name,
        triggerKind: r.triggerKind,
        triggerSpec: JSON.stringify(r.triggerSpec),
        effect: JSON.stringify(r.effect),
      },
    });
  }
  return sim.id;
}
