// k-means-on-intentions emergence detector (EAMI-inspired).
//
// Each tick, agents are vectorized by their recent action distribution. We
// 1-D project (move/speak/wait/vote/act share) and run k-means with k=2..3.
// A regime shift is detected when the cluster count of significant clusters
// jumps from 1 → 2+ between consecutive evaluations.

export interface IntentionsResult {
  fired: boolean;
  k: number;
  clusterSizes: number[];
  confidence: number;
}

export interface IntentionsState {
  lastK: number;
}

export function emptyIntentionsState(): IntentionsState {
  return { lastK: 1 };
}

// agentVectors[i] = 5-dim share vector summing to ~1
export function detectIntentionsKmeans(
  agentVectors: number[][],
  state: IntentionsState,
): IntentionsResult {
  if (agentVectors.length < 4) {
    return { fired: false, k: 1, clusterSizes: [agentVectors.length], confidence: 0 };
  }
  const best = bestK(agentVectors, [1, 2, 3]);
  const fired = best.k > state.lastK;
  state.lastK = best.k;
  const confidence = fired ? Math.min(1, best.silhouette) : 0;
  return {
    fired,
    k: best.k,
    clusterSizes: best.sizes,
    confidence,
  };
}

function bestK(
  vectors: number[][],
  ks: number[],
): { k: number; sizes: number[]; silhouette: number } {
  let bestSil = -Infinity;
  let chosen: { k: number; sizes: number[]; silhouette: number } = {
    k: 1,
    sizes: [vectors.length],
    silhouette: 0,
  };
  for (const k of ks) {
    if (k === 1) continue;
    const result = kmeans(vectors, k, 12);
    const sil = silhouette(vectors, result.assignments, result.centroids);
    // Penalize tiny clusters (size < 2): they're not regimes.
    const sizes = countSizes(result.assignments, k);
    const minSize = Math.min(...sizes);
    if (minSize < 2) continue;
    if (sil > bestSil) {
      bestSil = sil;
      chosen = { k, sizes, silhouette: sil };
    }
  }
  if (bestSil < 0.25) return { k: 1, sizes: [vectors.length], silhouette: 0 };
  return chosen;
}

function kmeans(
  vectors: number[][],
  k: number,
  maxIter: number,
): { centroids: number[][]; assignments: number[] } {
  const n = vectors.length;
  const dim = vectors[0].length;
  // Deterministic init: pick k evenly spaced points after sorting by first dim.
  const indices = vectors
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v[0] ?? 0) - (b.v[0] ?? 0))
    .map(({ i }) => i);
  const centroids: number[][] = [];
  for (let c = 0; c < k; c++) {
    const idx = indices[Math.floor(((c + 0.5) / k) * n)];
    centroids.push([...vectors[idx]]);
  }
  let assignments = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const prev = assignments[i];
      let bestD = Infinity;
      let bestC = 0;
      for (let c = 0; c < k; c++) {
        const d = sqDist(vectors[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      assignments[i] = bestC;
      if (bestC !== prev) changed = true;
    }
    if (!changed) break;
    // Recompute centroids
    for (let c = 0; c < k; c++) {
      const sum = new Array(dim).fill(0);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          for (let d = 0; d < dim; d++) sum[d] += vectors[i][d];
          count++;
        }
      }
      if (count > 0) for (let d = 0; d < dim; d++) sum[d] /= count;
      centroids[c] = sum;
    }
  }
  return { centroids, assignments };
}

function sqDist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return s;
}

function countSizes(assignments: number[], k: number): number[] {
  const sizes = new Array(k).fill(0);
  for (const a of assignments) sizes[a]++;
  return sizes;
}

function silhouette(
  vectors: number[][],
  assignments: number[],
  centroids: number[][],
): number {
  if (centroids.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < vectors.length; i++) {
    const own = sqDist(vectors[i], centroids[assignments[i]]);
    let nearest = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      if (c === assignments[i]) continue;
      const d = sqDist(vectors[i], centroids[c]);
      if (d < nearest) nearest = d;
    }
    const denom = Math.max(own, nearest);
    if (denom === 0) continue;
    total += (nearest - own) / denom;
  }
  return total / vectors.length;
}
