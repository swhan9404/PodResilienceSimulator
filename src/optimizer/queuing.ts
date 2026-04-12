import type { MMcKResult, ProbeParams } from './types';

/**
 * Compute M/M/c/K queuing model metrics using iterative ratio accumulation.
 * Numerically stable for large c via iterative ratio accumulation.
 *
 * @param lambda - arrival rate (requests/sec)
 * @param mu - service rate per server (1/avg_latency in seconds)
 * @param c - number of servers (workers)
 * @param K - total system capacity (workers + backlog)
 */
export function computeMMcK(
  lambda: number,
  mu: number,
  c: number,
  K: number,
): MMcKResult {
  // Guard: invalid parameters
  if (c <= 0 || K <= 0 || mu <= 0) {
    return { rho: Infinity, pBlock: 1, wq: Infinity, lq: K };
  }
  if (lambda <= 0) {
    return { rho: 0, pBlock: 0, wq: 0, lq: 0 };
  }

  const r = lambda / mu;
  const rho = lambda / (c * mu);

  // Build state probability ratios iteratively
  // ratio_n = P_n / P_0
  let sumRatios = 1.0; // ratio_0 = 1
  let ratio = 1.0;

  // For n = 1..c: ratio *= r/n (gives r^n / n!)
  for (let n = 1; n <= c; n++) {
    ratio *= r / n;
    sumRatios += ratio;
  }

  const ratioAtC = ratio; // r^c / c!

  // For n = c+1..K: ratio *= r/c (gives r^n / (c! * c^(n-c)))
  for (let n = c + 1; n <= K; n++) {
    ratio *= r / c;
    sumRatios += ratio;
  }

  const p0 = 1.0 / sumRatios;
  const pK = ratio * p0; // blocking probability

  // Lq: mean queue length
  let lq: number;
  if (Math.abs(rho - 1.0) < 1e-10) {
    // rho == 1 special case: avoid division by zero
    lq = ratioAtC * p0 * (K - c) * (K - c + 1) / 2;
  } else {
    const rhoKmC = Math.pow(rho, K - c);
    lq =
      (ratioAtC * rho * p0) / ((1 - rho) * (1 - rho)) *
      (1 - rhoKmC - (K - c) * rhoKmC * (1 - rho));
  }

  // Effective arrival rate (accounts for blocked customers)
  const lambdaEff = lambda * (1 - pK);
  // Wq = Lq / lambdaEff (Little's law)
  const wq = lambdaEff > 0 ? lq / lambdaEff : 0;

  return { rho, pBlock: pK, wq, lq };
}

/**
 * Compute effective workers per pod after subtracting probe duty cycle.
 * Per D-01, D-02, D-03: c_eff = c - (probe_rate * probe_duration)
 * Probe duration hardcoded to 1ms (0.001s) per D-02.
 */
export function computeEffectiveWorkers(
  workersPerPod: number,
  probes: ProbeParams,
): number {
  const probeDurationSec = 0.001; // 1ms per D-02
  const livenessRate = 1 / probes.livenessProbe.periodSeconds;
  const readinessRate = 1 / probes.readinessProbe.periodSeconds;
  const probeDutyCycle = (livenessRate + readinessRate) * probeDurationSec;
  return Math.max(workersPerPod - probeDutyCycle, 0.01);
}
