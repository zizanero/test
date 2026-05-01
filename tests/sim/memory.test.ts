import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { prisma } from "@/server/db";
import { ingestObservation, retrieve } from "@/sim/memory";
import { mulberry32 } from "@/sim/rng";

describe("Park-style memory", () => {
  const runId = "test-run-mem-" + Date.now();
  const agentId = "test-agent-mem-" + Date.now();

  beforeAll(async () => {
    // Set up a Run + Agent + dependencies row so foreign keys hold.
    const ws = await prisma.workspace.create({ data: { name: "T" } });
    const proj = await prisma.project.create({
      data: { workspaceId: ws.id, name: "T" },
    });
    const sim = await prisma.simulation.create({
      data: { projectId: proj.id, name: "T", spec: "{}" },
    });
    await prisma.run.create({
      data: {
        id: runId,
        simulationId: sim.id,
        label: "T",
        status: "running",
        seed: 1,
        totalTicks: 100,
        specSnapshot: "{}",
      },
    });
    const pop = await prisma.population.create({
      data: { simulationId: sim.id, name: "T" },
    });
    const cls = await prisma.agentClass.create({
      data: { populationId: pop.id, name: "T", count: 1, proseIdentity: "T", structured: "{}" },
    });
    await prisma.agent.create({
      data: { id: agentId, classId: cls.id, runId, displayName: "T", proseIdentity: "T", structured: "{}" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("retrieves by recency × importance × relevance", async () => {
    await ingestObservation({
      runId,
      agentId,
      tick: 1,
      content: "I had coffee with Maria at the cafe",
      importance: 6,
    });
    await ingestObservation({
      runId,
      agentId,
      tick: 2,
      content: "I read a book at the park",
      importance: 3,
    });
    await ingestObservation({
      runId,
      agentId,
      tick: 3,
      content: "Maria invited me to her birthday",
      importance: 8,
    });
    const top = await retrieve(agentId, "Maria", { runId, tick: 4 }, { k: 2 });
    expect(top.length).toBe(2);
    // Both top results should mention Maria.
    expect(top.every((m) => /Maria/i.test(m.content))).toBe(true);
  });

  it("retrievalCount increments on retrieval", async () => {
    const before = await prisma.memory.findFirst({
      where: { agentId, content: { contains: "birthday" } },
    });
    expect(before?.retrievalCount).toBeGreaterThanOrEqual(1);
  });

  it("RNG is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
});
