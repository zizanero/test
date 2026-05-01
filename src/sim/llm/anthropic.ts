import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let client: Anthropic | null = null;

function getClient() {
  if (!client) {
    if (!env.ANTHROPIC_API_KEY)
      throw new Error("ANTHROPIC_API_KEY is empty; cannot use anthropic provider");
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export interface AnthropicCallInput {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens?: number;
}

export interface AnthropicCallOutput {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export async function anthropicComplete(
  input: AnthropicCallInput,
): Promise<AnthropicCallOutput> {
  const c = getClient();
  const start = Date.now();
  const resp = await c.messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 800,
    temperature: input.temperature,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
  });
  const text = resp.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { type: string; text?: string }) => b.text ?? "")
    .join("");
  return {
    text,
    tokensIn: resp.usage.input_tokens,
    tokensOut: resp.usage.output_tokens,
  };
}

export function isAnthropicAvailable(): boolean {
  return !!env.ANTHROPIC_API_KEY;
}
