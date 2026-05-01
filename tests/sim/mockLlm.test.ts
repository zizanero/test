import { describe, expect, it, beforeEach } from "vitest";
import { complete, cacheReset } from "@/sim/llm";

describe("mock LLM determinism", () => {
  beforeEach(() => cacheReset());

  it("returns identical output for identical inputs", async () => {
    const args = {
      kind: "decision" as const,
      modelTier: "routine" as const,
      system: "You are agent #7 in a small town.",
      user: "What do you do at tick 12?",
      seed: 42,
      meta: {
        actionMenu: [
          { id: "a", description: "go to the cafe", kind: "move" as const, prior: 0.6 },
          { id: "b", description: "stay home", kind: "wait" as const, prior: 0.4 },
        ],
      },
    };
    const r1 = await complete(args);
    cacheReset();
    const r2 = await complete(args);
    expect(r1.text).toBe(r2.text);
    expect(r1.tokensIn).toBe(r2.tokensIn);
    expect(r1.tokensOut).toBe(r2.tokensOut);
  });

  it("cache hits return cached: true", async () => {
    const args = {
      kind: "narration" as const,
      modelTier: "gameMaster" as const,
      system: "narrator",
      user: "tick=5; events: cafe gathering",
      seed: 1,
    };
    const a = await complete(args);
    const b = await complete(args);
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(a.text).toBe(b.text);
  });

  it("different seeds produce diverse outputs across a sample", async () => {
    const base = {
      kind: "decision" as const,
      modelTier: "routine" as const,
      system: "x",
      user: "y",
      meta: {
        actionMenu: Array.from({ length: 5 }).map((_, i) => ({
          id: "act_" + i,
          description: "action " + i,
          kind: "act" as const,
          prior: 0.5,
        })),
      },
    };
    const outputs = new Set<string>();
    for (let s = 1; s <= 20; s++) {
      cacheReset();
      const r = await complete({ ...base, seed: s });
      outputs.add(r.text);
    }
    // Across 20 seeds and 5 menu items, we should see >= 3 distinct picks.
    expect(outputs.size).toBeGreaterThanOrEqual(3);
  });
});
