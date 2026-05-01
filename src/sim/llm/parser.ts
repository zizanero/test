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

// --- scenario generator schema -----------------------------------------

const ScenarioLocation = z.object({
  name: z.string().min(1),
  kind: z.enum(["area", "sub_area", "object"]).default("area"),
  x: z.number().int(),
  y: z.number().int(),
  capacity: z.number().int().nullable().optional(),
});

const ScenarioClass = z.object({
  name: z.string().min(1),
  count: z.number().int().min(1).max(500),
  proseIdentity: z.string().min(10),
  initialBeliefs: z.record(z.number()).optional(),
  initialGoal: z.string().optional(),
  initialLocationName: z.string().min(1),
});

const ScenarioEffect = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("inject_observation"),
    payload: z.object({
      text: z.string().min(1),
      fraction: z.number().min(0).max(1).default(1),
    }),
  }),
  z.object({
    kind: z.literal("mutate_ambient"),
    payload: z.object({
      topic: z.string().min(1),
      delta: z.number(),
    }),
  }),
]);

const ScenarioRule = z.object({
  name: z.string().min(1),
  triggerKind: z.enum(["tick", "predicate", "manual"]).default("tick"),
  triggerSpec: z.object({
    atTick: z.number().int().min(0).optional(),
    everyN: z.number().int().min(1).optional(),
  }),
  effect: ScenarioEffect,
});

export const ScenarioSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  population: z.object({
    classes: z.array(ScenarioClass).min(1).max(8),
  }),
  world: z.object({
    name: z.string().min(1),
    width: z.number().int().min(8).max(60),
    height: z.number().int().min(6).max(40),
    locations: z.array(ScenarioLocation).min(1).max(20),
  }),
  rules: z.array(ScenarioRule).max(8).default([]),
  scenario: z.object({
    totalTicks: z.number().int().min(10).max(500),
    fidelity: z.enum(["cheap", "balanced", "high_fidelity"]).default("balanced"),
    defaultSeed: z.number().int().default(42),
    costCapUsd: z.number().nonnegative().default(3),
  }),
});

export type ScenarioGenerated = z.infer<typeof ScenarioSchema>;

// Validator for AI-generated scenarios. Beyond schema, ensures every persona's
// initialLocationName references a real location.
export function validateScenario(s: ScenarioGenerated): {
  ok: boolean;
  errors: string[];
} {
  const locNames = new Set(s.world.locations.map((l) => l.name));
  const errors: string[] = [];
  for (const cls of s.population.classes) {
    if (!locNames.has(cls.initialLocationName)) {
      errors.push(
        `class "${cls.name}" references unknown location "${cls.initialLocationName}"`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}
