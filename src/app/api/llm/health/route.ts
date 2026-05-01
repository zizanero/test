import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    mode: env.resolvedLlmMode,
    models: {
      routine: env.LLM_MODEL_ROUTINE,
      reflection: env.LLM_MODEL_REFLECTION,
      gameMaster: env.LLM_MODEL_GAMEMASTER,
    },
    deterministic: env.SIM_DETERMINISTIC,
    costHardCapUsd: env.COST_HARD_CAP_USD,
  });
}
