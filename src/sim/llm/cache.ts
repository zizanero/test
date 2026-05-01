import { createHash } from "node:crypto";

interface CacheEntry {
  text: string;
  tokensIn: number;
  tokensOut: number;
  modelName: string;
  createdAt: number;
}

const cache = new Map<string, CacheEntry>();
let hits = 0;
let misses = 0;

export function cacheKey(input: {
  model: string;
  system: string;
  user: string;
  temperature: number;
  seed: number | null;
}) {
  return createHash("sha256")
    .update(input.model)
    .update("\n--\n")
    .update(input.system)
    .update("\n--\n")
    .update(input.user)
    .update("\n--\n")
    .update(String(input.temperature))
    .update("\n--\n")
    .update(String(input.seed ?? ""))
    .digest("hex");
}

export function cacheGet(key: string): CacheEntry | null {
  const v = cache.get(key);
  if (v) hits++;
  else misses++;
  return v ?? null;
}

export function cachePut(key: string, entry: CacheEntry) {
  cache.set(key, entry);
}

export function cacheStats() {
  return {
    hits,
    misses,
    size: cache.size,
    hitRate: hits + misses === 0 ? 0 : hits / (hits + misses),
  };
}

export function cacheReset() {
  cache.clear();
  hits = 0;
  misses = 0;
}
