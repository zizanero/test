import { createHash } from "node:crypto";
import { prisma } from "@/server/db";

export interface Preregistration {
  hypotheses: string[];
  primaryMetrics: string[];
  stopConditions: { kind: "tick_limit" | "predicate" | "manual"; value?: string }[];
  notes?: string;
  hash: string;
  lockedAt: string;
}

export interface PreregistrationDraft {
  hypotheses: string[];
  primaryMetrics: string[];
  stopConditions: { kind: "tick_limit" | "predicate" | "manual"; value?: string }[];
  notes?: string;
}

// Lock a pre-registration onto a Run BEFORE it starts. Once locked, edits are
// rejected at the API layer; the SHA-256 hash is the tamper-evident record
// for OSF-style export.
export async function lockPreregistration(
  runId: string,
  draft: PreregistrationDraft,
): Promise<Preregistration> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) throw new Error("run not found");
  if (run.preregistration) {
    throw new Error("run is already pre-registered (immutable)");
  }
  if (run.status !== "queued" && run.currentTick > 0) {
    throw new Error("cannot pre-register a run that has already produced ticks");
  }
  const canonical = JSON.stringify({
    hypotheses: draft.hypotheses,
    primaryMetrics: draft.primaryMetrics,
    stopConditions: draft.stopConditions,
    notes: draft.notes ?? "",
  });
  const hash = createHash("sha256").update(canonical).digest("hex");
  const record: Preregistration = {
    hypotheses: draft.hypotheses,
    primaryMetrics: draft.primaryMetrics,
    stopConditions: draft.stopConditions,
    notes: draft.notes,
    hash,
    lockedAt: new Date().toISOString(),
  };
  await prisma.run.update({
    where: { id: runId },
    data: { preregistration: JSON.stringify(record) },
  });
  return record;
}

export async function readPreregistration(
  runId: string,
): Promise<Preregistration | null> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { preregistration: true },
  });
  if (!run?.preregistration) return null;
  return JSON.parse(run.preregistration) as Preregistration;
}

export function verifyHash(rec: Preregistration): boolean {
  const canonical = JSON.stringify({
    hypotheses: rec.hypotheses,
    primaryMetrics: rec.primaryMetrics,
    stopConditions: rec.stopConditions,
    notes: rec.notes ?? "",
  });
  const expected = createHash("sha256").update(canonical).digest("hex");
  return expected === rec.hash;
}
