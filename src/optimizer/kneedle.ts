import type { KneeResult } from './types';

/**
 * Find the knee (inflection) point on a decreasing concave curve.
 * Uses the Kneedle algorithm (Satopaa et al. 2011) with threshold fallback.
 *
 * @param xs - X values (ascending, e.g., total workers)
 * @param ys - Y values (decreasing, e.g., P_block)
 * @param sensitivity - Kneedle sensitivity, default 1.0
 * @param threshold - Fallback P_block threshold, default 0.01 per D-06
 */
export function findKneePoint(
  xs: number[],
  ys: number[],
  sensitivity?: number,
  threshold?: number,
): KneeResult {
  const t = threshold ?? 0.01;
  const fallbackIndex = computeFallback(ys, t);

  // Guard: need at least 3 points for knee detection
  if (xs.length < 3) {
    return { kneeIndex: null, fallbackIndex, method: 'threshold' };
  }

  // Step 1: Normalize to [0, 1]
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const xn = xs.map((x) => (x - xMin) / xRange);
  const yn = ys.map((y) => (y - yMin) / yRange);

  // Step 2: Compute difference curve for decreasing data
  // For decreasing curve, flip y: diff[i] = (1 - yn[i]) - xn[i]
  const diff = yn.map((y, i) => (1 - y) - xn[i]);

  // Step 3: Find local maximum of difference curve
  const s = sensitivity ?? 1.0;
  const thresholdValue = s / xs.length;
  let bestIdx = -1;
  let bestVal = -Infinity;

  for (let i = 1; i < diff.length - 1; i++) {
    if (diff[i] >= diff[i - 1] && diff[i] >= diff[i + 1]) {
      if (diff[i] > bestVal && diff[i] > thresholdValue) {
        bestVal = diff[i];
        bestIdx = i;
      }
    }
  }

  if (bestIdx >= 0) {
    return { kneeIndex: bestIdx, fallbackIndex, method: 'kneedle' };
  }
  return { kneeIndex: null, fallbackIndex, method: 'threshold' };
}

/** Find first index where ys[i] < threshold (per D-05, D-06) */
function computeFallback(
  ys: number[],
  threshold: number,
): number | null {
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] < threshold) {
      return i;
    }
  }
  return null;
}
