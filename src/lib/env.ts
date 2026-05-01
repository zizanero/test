import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  ANTHROPIC_API_KEY: z.string().default(""),
  LLM_MODE: z.enum(["auto", "mock", "anthropic"]).default("auto"),
  LLM_MODEL_ROUTINE: z.string().default("claude-haiku-4-5"),
  LLM_MODEL_REFLECTION: z.string().default("claude-sonnet-4-6"),
  LLM_MODEL_GAMEMASTER: z.string().default("claude-sonnet-4-6"),
  COST_HARD_CAP_USD: z.coerce.number().default(5),
  SIM_DETERMINISTIC: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Populace"),
});

const parsed = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  LLM_MODE: process.env.LLM_MODE,
  LLM_MODEL_ROUTINE: process.env.LLM_MODEL_ROUTINE,
  LLM_MODEL_REFLECTION: process.env.LLM_MODEL_REFLECTION,
  LLM_MODEL_GAMEMASTER: process.env.LLM_MODEL_GAMEMASTER,
  COST_HARD_CAP_USD: process.env.COST_HARD_CAP_USD,
  SIM_DETERMINISTIC: process.env.SIM_DETERMINISTIC,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});

export const env = {
  ...parsed,
  resolvedLlmMode:
    parsed.LLM_MODE === "auto"
      ? parsed.ANTHROPIC_API_KEY
        ? ("anthropic" as const)
        : ("mock" as const)
      : parsed.LLM_MODE,
};

export type Env = typeof env;
