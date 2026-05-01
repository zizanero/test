import { hash32 } from "./rng";

export const EMBED_DIM = 32;

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "of", "to", "in", "on", "for", "and", "or", "but", "with", "at",
  "by", "from", "as", "that", "this", "it", "its", "i", "me", "my",
  "we", "our", "you", "your", "he", "she", "they", "them", "their",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Hashed bag-of-words embedding. Deterministic, replicable, no model drift.
export function embed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const i = hash32(tok) % EMBED_DIM;
    const sign = (hash32("sign:" + tok) & 1) === 0 ? 1 : -1;
    v[i] += sign;
  }
  // L2 normalize
  let mag = 0;
  for (const x of v) mag += x * x;
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < v.length; i++) v[i] /= mag;
  return v;
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
