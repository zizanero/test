import { prisma } from "@/server/db";
import { getTemplate, type TemplateSpec } from "@/templates";

// Deep-clone a Template into Simulation + Population + AgentClass + World + Locations + RuleEvents.
export async function instantiateTemplate(args: {
  slug: string;
  projectId: string;
  name?: string;
}): Promise<{ simulationId: string }> {
  const t = getTemplate(args.slug);
  if (!t) throw new Error(`Template not found: ${args.slug}`);

  const sim = await prisma.simulation.create({
    data: {
      projectId: args.projectId,
      name: args.name ?? t.title,
      description: t.description,
      templateSlug: t.slug,
      spec: JSON.stringify({
        population: t.population,
        world: t.world,
        rules: t.rules,
        scenario: t.scenario,
      }),
    },
  });

  // World
  const world = await prisma.world.create({
    data: {
      simulationId: sim.id,
      name: t.world.name,
      width: t.world.width,
      height: t.world.height,
    },
  });

  // Locations (parent linking by name)
  const locByName: Record<string, string> = {};
  for (const loc of t.world.locations) {
    const created = await prisma.location.create({
      data: {
        worldId: world.id,
        name: loc.name,
        kind: loc.kind,
        x: loc.x,
        y: loc.y,
        capacity: loc.capacity ?? null,
        affordances: loc.affordances ? JSON.stringify(loc.affordances) : null,
        parentId: loc.parentName ? locByName[loc.parentName] ?? null : null,
      },
    });
    locByName[loc.name] = created.id;
  }

  // Population + AgentClasses
  const pop = await prisma.population.create({
    data: { simulationId: sim.id, name: "Population" },
  });
  for (const cls of t.population.classes) {
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

  // Rules
  for (const r of t.rules) {
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

  return { simulationId: sim.id };
}

// Spawn agent rows for a given Run from the simulation's agent classes.
// Each AgentClass.count rows are produced; each gets a derived displayName.
export async function spawnAgentsForRun(args: {
  runId: string;
  simulationId: string;
}): Promise<void> {
  const sim = await prisma.simulation.findUnique({
    where: { id: args.simulationId },
    include: {
      populations: { include: { agentClasses: true } },
      worlds: { include: { locations: true } },
    },
  });
  if (!sim) throw new Error("simulation gone");

  const allLocs = sim.worlds.flatMap((w) => w.locations);
  const tplSpec = await prisma.template.findUnique({ where: { slug: sim.templateSlug ?? "" } });
  const tplJson = tplSpec ? (JSON.parse(tplSpec.spec) as TemplateSpec) : null;

  for (const pop of sim.populations) {
    for (const cls of pop.agentClasses) {
      const tplCls = tplJson?.population?.classes?.find((c) => c.name === cls.name);
      const initialLocName = tplCls?.initialLocationName;
      const initialLocId = initialLocName
        ? allLocs.find((l) => l.name === initialLocName)?.id ?? null
        : allLocs[0]?.id ?? null;
      const beliefs = JSON.stringify(tplCls?.initialBeliefs ?? {});
      const goal = tplCls?.initialGoal ?? null;
      const individuals = tplCls?.individuals ?? [];

      for (let i = 0; i < cls.count; i++) {
        const display = individuals[i]?.displayName ?? (cls.count === 1 ? cls.name : `${cls.name} #${i + 1}`);
        const prose = individuals[i]?.proseIdentity ?? cls.proseIdentity;
        await prisma.agent.create({
          data: {
            classId: cls.id,
            runId: args.runId,
            seedKey: `${cls.name}::${i}`,
            displayName: display,
            proseIdentity: prose,
            structured: cls.structured,
            currentLocationId: initialLocId,
            beliefs,
            goal,
          },
        });
      }
    }
  }
}
