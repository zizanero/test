// Approximate Anthropic per-million-token pricing (USD). Stand-ins so the
// cost ledger is exercised; actual rates pulled from billing in production.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  // Mock model: zero cost.
  "mock": { input: 0, output: 0 },
};

export function priceCall(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = PRICES[model] ?? { input: 1, output: 5 };
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}

export function modelExists(model: string): boolean {
  return model in PRICES;
}
