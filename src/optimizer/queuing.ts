import type { MMcKResult, ProbeParams } from './types';

export function computeMMcK(
  lambda: number,
  mu: number,
  c: number,
  K: number,
): MMcKResult {
  // TODO: implement
  return { rho: 0, pBlock: 0, wq: 0, lq: 0 };
}

export function computeEffectiveWorkers(
  workersPerPod: number,
  probes: ProbeParams,
): number {
  // TODO: implement
  return workersPerPod;
}
