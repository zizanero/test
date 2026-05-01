import { prisma } from "@/server/db";
import type { ModelTier } from "./types";

export interface CostEntry {
  runId: string;
  tick: number;
  agentId?: string | null;
  modelName: string;
  tier: ModelTier;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cached: boolean;
}

export async function recordCost(entry: CostEntry) {
  await prisma.costLedger.create({ data: { ...entry, agentId: entry.agentId ?? null } });
  if (entry.costUsd > 0) {
    await prisma.run.update({
      where: { id: entry.runId },
      data: { costUsd: { increment: entry.costUsd } },
    });
  }
}

export async function exceededCap(runId: string): Promise<boolean> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { costUsd: true, costCap: true },
  });
  if (!run?.costCap) return false;
  return run.costUsd >= run.costCap;
}
