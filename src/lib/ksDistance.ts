// Kolmogorov–Smirnov + Wasserstein-1 between two empirical samples.
// Both inputs assumed to be unsorted arrays of finite numbers.

export function ksDistance(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 1;
  const xa = a.slice().sort((p, q) => p - q);
  const xb = b.slice().sort((p, q) => p - q);
  let i = 0;
  let j = 0;
  let maxD = 0;
  while (i < xa.length && j < xb.length) {
    const xv = Math.min(xa[i], xb[j]);
    while (i < xa.length && xa[i] <= xv) i++;
    while (j < xb.length && xb[j] <= xv) j++;
    const cdfA = i / xa.length;
    const cdfB = j / xb.length;
    maxD = Math.max(maxD, Math.abs(cdfA - cdfB));
  }
  return maxD;
}

// Wasserstein-1 (sorted-pairs approximation: treat samples as the same size by
// sub-sampling longer one to length of shorter; this is the standard CDF-based 1-Wasserstein).
export function wasserstein1(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return Number.NaN;
  const xa = a.slice().sort((p, q) => p - q);
  const xb = b.slice().sort((p, q) => p - q);
  const n = Math.min(xa.length, xb.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const ia = Math.floor((i / n) * xa.length);
    const ib = Math.floor((i / n) * xb.length);
    sum += Math.abs(xa[ia] - xb[ib]);
  }
  return sum / n;
}
