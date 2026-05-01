import { env } from "@/lib/env";
import { mockComplete } from "./mock";
import { anthropicComplete } from "./anthropic";
import { cacheGet, cacheKey, cachePut } from "./cache";
import { priceCall } from "./pricing";
import type { LlmCallKind, ModelTier } from "@/sim/types";
import type { ActionMenuItem, AgentRuntime } from "@/sim/types";

export interface CompleteInput {
  kind: LlmCallKind;
  modelTier: ModelTier;
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
      costUsd: 0, // cached → no incremental cost
      cached: true,
      modelName: hit.modelName,
      durationMs: 0,
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

  cachePut(key, {
    text,
    tokensIn,
    tokensOut,
    modelName,
    createdAt: Date.now(),
  });

  return { text, tokensIn, tokensOut, costUsd, cached: false, modelName, durationMs };
}

export { cacheStats, cacheReset } from "./cache";
