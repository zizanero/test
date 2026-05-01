// Best-effort JSON extraction + repair retry. The mock LLM always emits
// valid JSON (because we author it directly), but real Claude occasionally
// wraps JSON in prose or adds a stray comma. This module:
//   - extracts the first JSON object from a string
//   - validates against a zod schema
//   - on failure, the caller can request a repair by re-prompting
//
// Returns the parsed value or null. Caller handles fallback.

import { z, type ZodType } from "zod";

export interface ParseResult<T> {
  value: T | null;
  raw: string;
  error?: string;
}

export function extractJson(text: string): unknown | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    // Try to repair common issues: trailing commas before } or ]
    const repaired = m[0].replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

export function parseAndValidate<T>(
  text: string,
  schema: ZodType<T>,
): ParseResult<T> {
  const json = extractJson(text);
  if (json === null) return { value: null, raw: text, error: "no JSON object found" };
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { value: null, raw: text, error: parsed.error.message };
  }
  return { value: parsed.data, raw: text };
}

// Zod schemas mirroring the prompts in src/sim/llm/prompts.

export const DecisionSchema = z.object({
  actionId: z.string().optional(),
  actionKind: z.enum(["move", "speak", "wait", "act", "vote"]).optional(),
  actionDescription: z.string().optional(),
  actionParams: z.record(z.unknown()).optional(),
  reasoning: z.string().optional(),
  reasoningSummary: z.string().optional(),
});

export const ImportanceSchema = z.object({
  importance: z.number().min(0).max(10),
});

export const ReflectionSchema = z.object({
  insights: z
    .array(
      z.object({
        insight: z.string(),
        evidenceMemoryIds: z.array(z.string()).default([]),
        importance: z.number().min(0).max(10).default(6),
      }),
    )
    .default([]),
});

export const CausalSchema = z.object({
  narrative: z.string(),
  causes: z
    .array(
      z.object({
        label: z.string(),
        confidence: z.number().min(0).max(1),
        evidenceMemoryIds: z.array(z.string()).default([]),
        evidenceAgentIds: z.array(z.string()).default([]),
        perturbation: z.string().default(""),
      }),
    )
    .default([]),
  no_evidence: z.boolean().default(false),
});

export type Decision = z.infer<typeof DecisionSchema>;
export type Importance = z.infer<typeof ImportanceSchema>;
export type Reflection = z.infer<typeof ReflectionSchema>;
export type Causal = z.infer<typeof CausalSchema>;
