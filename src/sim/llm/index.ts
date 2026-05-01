import { env } from "@/lib/env";
import { mockComplete } from "./mock";
import { anthropicComplete } from "./anthropic";
import { cacheGet, cacheKey, cachePut } from "./cache";
import { priceCall } from "./pricing";
import type { LlmCallKind, ModelTier } from "@/sim/types";
import type { ActionMenuItem, AgentRuntime } from "@/sim/types";
import { extractJson } from "./parser";
import type { ZodType } from "zod";

export interface CompleteInput {
  kind: LlmCallKind;
  modelTier: ModelTier;
  promptName?: string;
  promptVersion?: string;
  system: string;
  user: string;
  temperature?: number;
  seed?: number;
  // Mock-only metadata (real provider ignores).
  meta?: {
    agent?: AgentRuntime;
    actionMenu?: ActionMenuItem[];
    retrievedMemoryIds?: string[];
    location?: string;
  };
}

export interface CompleteOutput {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cached: boolean;
  modelName: string;
  durationMs: number;
  promptName: string | null;
  promptVersion: string | null;
}

function pickModel(tier: ModelTier): string {
  if (tier === "routine") return env.LLM_MODEL_ROUTINE;
  if (tier === "reflection") return env.LLM_MODEL_REFLECTION;
  return env.LLM_MODEL_GAMEMASTER;
}

export async function complete(input: CompleteInput): Promise<CompleteOutput> {
  const provider = env.resolvedLlmMode;
  const modelName = provider === "mock" ? "mock" : pickModel(input.modelTier);
  const temperature =
    env.SIM_DETERMINISTIC ? 0 : input.temperature ?? 0.7;
  const seed = input.seed ?? null;

  const key = cacheKey({
    model: modelName,
    system: input.system,
    user: input.user,
    temperature,
    seed,
  });
  const hit = cacheGet(key);
  if (hit) {
    return {
      text: hit.text,
      tokensIn: hit.tokensIn,
      tokensOut: hit.tokensOut,
      costUsd: 0,
      cached: true,
      modelName: hit.modelName,
      durationMs: 0,
      promptName: input.promptName ?? null,
      promptVersion: input.promptVersion ?? null,
    };
  }

  const start = Date.now();
  let text: string;
  let tokensIn: number;
  let tokensOut: number;
  if (provider === "mock") {
    const out = mockComplete({
      kind: input.kind,
      system: input.system,
      user: input.user,
      seed: seed ?? 0,
      meta: input.meta,
    });
    text = out.text;
    tokensIn = out.tokensIn;
    tokensOut = out.tokensOut;
  } else {
    const out = await anthropicComplete({
      model: modelName,
      system: input.system,
      user: input.user,
      temperature,
    });
    text = out.text;
    tokensIn = out.tokensIn;
    tokensOut = out.tokensOut;
  }
  const durationMs = Date.now() - start;
  const costUsd = priceCall(modelName, tokensIn, tokensOut);

  cachePut(key, { text, tokensIn, tokensOut, modelName, createdAt: Date.now() });

  return {
    text,
    tokensIn,
    tokensOut,
    costUsd,
    cached: false,
    modelName,
    durationMs,
    promptName: input.promptName ?? null,
    promptVersion: input.promptVersion ?? null,
  };
}

// Convenience wrapper: complete + JSON validate + 1 repair retry.
// Real Claude occasionally wraps JSON in prose or adds trailing commas; the
// repair pass re-asks with stricter instructions. Mock always emits valid JSON
// so this short-circuits in mock mode.
export async function completeJson<T>(
  input: CompleteInput,
  schema: ZodType<T>,
): Promise<{ value: T | null; raw: CompleteOutput; raw2?: CompleteOutput; error?: string }> {
  const r1 = await complete(input);
  const j1 = extractJson(r1.text);
  const v1 = j1 !== null ? schema.safeParse(j1) : null;
  if (v1?.success) return { value: v1.data, raw: r1 };
  // Repair: re-ask with explicit instruction.
  if (env.resolvedLlmMode === "mock") {
    // Mock won't repair itself; fall through to the caller's fallback.
    return { value: null, raw: r1, error: v1?.error?.message ?? "no JSON" };
  }
  const repair = await complete({
    ...input,
    seed: (input.seed ?? 0) + 1,
    user:
      input.user +
      `\n\n--\nReminder: your previous reply was not valid JSON for this schema. Output ONLY the JSON object, no prose, no markdown fences.`,
  });
  const j2 = extractJson(repair.text);
  const v2 = j2 !== null ? schema.safeParse(j2) : null;
  if (v2?.success) return { value: v2.data, raw: r1, raw2: repair };
  return {
    value: null,
    raw: r1,
    raw2: repair,
    error: v2?.error?.message ?? "no JSON after repair",
  };
}

export { cacheStats, cacheReset } from "./cache";
