import { complete } from "@/sim/llm";
import { renderScenarioPrompt } from "@/sim/llm/prompts";
import { ScenarioSchema, validateScenario, extractJson, type ScenarioGenerated } from "@/sim/llm/parser";

export interface GenerateScenarioInput {
  description: string;
  seed?: number;
}

export interface GenerateScenarioResult {
  ok: boolean;
  scenario: ScenarioGenerated | null;
  errors: string[];
  promptVersion: string;
  modelName: string;
  costUsd: number;
  rawText: string;
}

// Generate a runnable simulation spec from a one-paragraph description.
// Validates against ScenarioSchema and ensures all initialLocationName fields
// reference real locations in world.locations.
export async function generateScenario(
  input: GenerateScenarioInput,
): Promise<GenerateScenarioResult> {
  const prompt = renderScenarioPrompt({ description: input.description });
  const out = await complete({
    kind: "game_master", // tier-routed; uses Sonnet
    modelTier: "gameMaster",
    promptName: prompt.promptName,
    promptVersion: prompt.promptVersion,
    seed: input.seed ?? Math.floor(Math.random() * 100000),
    temperature: 0.6,
    system: prompt.system,
    user: prompt.user,
  });

  const json = extractJson(out.text);
  const parsed = json !== null ? ScenarioSchema.safeParse(json) : null;
  if (!parsed?.success) {
    return {
      ok: false,
      scenario: null,
      errors: [
        parsed?.error?.message ?? "scenario JSON parse failed",
      ],
      promptVersion: prompt.promptVersion,
      modelName: out.modelName,
      costUsd: out.costUsd,
      rawText: out.text,
    };
  }

  const validation = validateScenario(parsed.data);
  return {
    ok: validation.ok,
    scenario: parsed.data,
    errors: validation.errors,
    promptVersion: prompt.promptVersion,
    modelName: out.modelName,
    costUsd: out.costUsd,
    rawText: out.text,
  };
}
