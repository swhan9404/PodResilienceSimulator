import type { OptimizerInput, SweepPoint } from './types';
import { computeMMcK, computeEffectiveWorkers } from './queuing';

/**
 * Compute a parameter sweep over workersPerPod x podCount grid.
 * Returns sorted SweepPoint array with M/M/c/K results for each combination.
 *
 * Auto-derives ranges from input RPS and request profile per D-07.
 * Grid is always capped at 500 points per D-08.
 */
export function computeSweep(
  input: OptimizerInput,
  rangeOverride?: {
    podRange?: [number, number];
    workerRange?: [number, number];
  },
): SweepPoint[] {
  // Compute weighted average latency
  const avgLatencyMs = input.requestProfiles.reduce(
    (sum, p) => sum + p.latencyMs * p.ratio,
    0,
  );
  // Service rate per worker (requests/sec)
  const mu = 1000 / avgLatencyMs;

  // Minimum total workers for stability: ceil(lambda / mu)
  const minWorkers = Math.ceil(input.rps / mu);

  // Auto-derive bounds per D-07
  const lowerBound = Math.max(1, Math.floor(minWorkers * 0.5));
  const upperBound = Math.max(lowerBound + 1, Math.ceil(minWorkers * 2.5));

  // Derive per-axis ranges
  let podMin = rangeOverride?.podRange?.[0] ?? 1;
  let podMax = rangeOverride?.podRange?.[1] ?? Math.max(podMin, upperBound);
  let workerMin = rangeOverride?.workerRange?.[0] ?? 1;
  let workerMax =
    rangeOverride?.workerRange?.[1] ?? Math.max(workerMin, upperBound);

  // Clamp grid to <= 500 points per D-08
  const MAX_GRID = 500;
  let gridSize = (podMax - podMin + 1) * (workerMax - workerMin + 1);

  if (gridSize > MAX_GRID && !rangeOverride) {
    // Reduce both axes proportionally
    const maxPerAxis = Math.floor(Math.sqrt(MAX_GRID));
    podMax = Math.min(podMax, podMin + maxPerAxis - 1);
    workerMax = Math.min(workerMax, workerMin + maxPerAxis - 1);
    gridSize = (podMax - podMin + 1) * (workerMax - workerMin + 1);
  }

  // Execute sweep
  const points: SweepPoint[] = [];

  for (let pod = podMin; pod <= podMax; pod++) {
    for (let w = workerMin; w <= workerMax; w++) {
      const cEff = computeEffectiveWorkers(w, input.probes);
      const totalC = cEff * pod;
      const totalK = (w + input.maxBacklogPerPod) * pod;

      const result = computeMMcK(input.rps, mu, totalC, totalK);
      points.push({
        podCount: pod,
        workersPerPod: w,
        totalWorkers: pod * w,
        result,
      });
    }
  }

  // Sort by totalWorkers ascending, then podCount ascending for ties
  points.sort((a, b) => {
    if (a.totalWorkers !== b.totalWorkers) {
      return a.totalWorkers - b.totalWorkers;
    }
    return a.podCount - b.podCount;
  });

  return points;
}
