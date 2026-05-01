import { prisma } from "@/server/db";

// Long-format per-tick × per-agent decision data, suitable for pandas long-format ingest.
export async function exportRunCsv(runId: string): Promise<string> {
  const decisions = await prisma.decision.findMany({
    where: { runId },
    include: { agent: { select: { displayName: true, classId: true, class: { select: { name: true } } } } },
    orderBy: [{ tick: "asc" }],
  });

  const lines: string[] = [];
  lines.push(
    [
      "tick",
      "agent_id",
      "agent_name",
      "class",
      "action_kind",
      "action_description",
      "model_name",
      "model_tier",
      "tokens_in",
      "tokens_out",
      "cost_usd",
      "cached",
      "duration_ms",
      "reasoning_summary",
    ].join(","),
  );
  for (const d of decisions) {
    const action = JSON.parse(d.action) as { kind: string; description: string };
    lines.push(
      [
        d.tick,
        d.agentId,
        csvEscape(d.agent.displayName),
        csvEscape(d.agent.class?.name ?? ""),
        action.kind,
        csvEscape(action.description),
        d.modelName,
        d.modelTier,
        d.tokensIn,
        d.tokensOut,
        d.costUsd.toFixed(6),
        d.cached ? "true" : "false",
        d.durationMs,
        csvEscape(d.reasoningSummary ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
