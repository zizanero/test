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

  it("different seeds produce different output", async () => {
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
    const r1 = await complete({ ...base, seed: 1 });
    cacheReset();
    const r2 = await complete({ ...base, seed: 2 });
    // It's possible (but unlikely) two different seeds produce same pick;
    // ensure outputs are at least distinct strings most of the time.
    expect(r1.text === r2.text).toBe(false);
  });
});
