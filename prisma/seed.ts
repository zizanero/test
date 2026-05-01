import { PrismaClient } from "@prisma/client";
import { listTemplates } from "../src/templates";

const prisma = new PrismaClient();

async function main() {
  // Default workspace + project so the UI has somewhere to land.
  const ws = await prisma.workspace.upsert({
    where: { id: "default-workspace" },
    update: {},
    create: { id: "default-workspace", name: "Default workspace" },
  });
  const proj = await prisma.project.upsert({
    where: { id: "default-project" },
    update: {},
    create: {
      id: "default-project",
      workspaceId: ws.id,
      name: "First project",
      description: "Auto-created so you have somewhere to start.",
    },
  });

  for (const t of listTemplates()) {
    await prisma.template.upsert({
      where: { slug: t.slug },
      update: {
        category: t.category,
        title: t.title,
        description: t.description,
        attribution: t.attribution ?? null,
        spec: JSON.stringify({
          population: t.population,
          world: t.world,
          rules: t.rules,
          scenario: t.scenario,
        }),
        dashboard: JSON.stringify(t.dashboard),
        readmeMd: t.readmeMd,
      },
      create: {
        slug: t.slug,
        category: t.category,
        title: t.title,
        description: t.description,
        attribution: t.attribution ?? null,
        spec: JSON.stringify({
          population: t.population,
          world: t.world,
          rules: t.rules,
          scenario: t.scenario,
        }),
        dashboard: JSON.stringify(t.dashboard),
        readmeMd: t.readmeMd,
      },
    });
    console.log(`✓ template seeded: ${t.slug}`);
  }
  console.log(`✓ workspace=${ws.id} project=${proj.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
