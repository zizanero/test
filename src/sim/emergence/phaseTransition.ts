// Phase-transition detector (Desai-Zwanzig style moment-eigenvalue ratio).
//
// Tracks the variance of belief vectors over a rolling window. A spike in the
// ratio variance(t)/variance(t-w) above a threshold flags a phase transition.
//
// Pure function: feed in belief vectors at the current tick, returns whether
// a transition has fired plus a confidence score.

export interface PhaseTransitionResult {
  fired: boolean;
  confidence: number;
  varianceNow: number;
  varianceBaseline: number;
  ratio: number;
}

// Rolling baseline maintained by the caller; we hand it in.
export interface PhaseTransitionState {
  baselineWindow: number[]; // recent variance values, oldest first
}

export function emptyPhaseState(): PhaseTransitionState {
  return { baselineWindow: [] };
}

const BASELINE_TICKS = 8;
const RATIO_THRESHOLD = 2.5;

export function detectPhaseTransition(
  beliefVectors: number[][],
  state: PhaseTransitionState,
): PhaseTransitionResult {
  if (beliefVectors.length < 2 || beliefVectors[0].length === 0) {
    return {
      fired: false,
      confidence: 0,
      varianceNow: 0,
      varianceBaseline: 0,
      ratio: 0,
    };
  }
  // Total variance = mean of per-dimension variances.
  const dim = beliefVectors[0].length;
  let total = 0;
  for (let d = 0; d < dim; d++) {
    const xs = beliefVectors.map((v) => v[d] ?? 0);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
    total += v;
  }
  const varianceNow = total / dim;
  const baselineWindow = state.baselineWindow;
  const baseline =
    baselineWindow.length === 0
      ? varianceNow
      : baselineWindow.reduce((a, b) => a + b, 0) / baselineWindow.length;
  const ratio = baseline === 0 ? 0 : varianceNow / baseline;

  // Update window for next call.
  state.baselineWindow.push(varianceNow);
  if (state.baselineWindow.length > BASELINE_TICKS) state.baselineWindow.shift();

  const fired = ratio >= RATIO_THRESHOLD && baselineWindow.length >= 4;
  // Confidence: how far above threshold, capped at 1.
  const confidence = fired ? Math.min(1, (ratio - RATIO_THRESHOLD) / RATIO_THRESHOLD) : 0;
  return { fired, confidence, varianceNow, varianceBaseline: baseline, ratio };
}
