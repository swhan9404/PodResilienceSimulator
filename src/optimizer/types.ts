/** Probe parameters needed for effective worker calculation (per D-01) */
export interface ProbeParams {
  livenessProbe: { periodSeconds: number };
  readinessProbe: { periodSeconds: number };
}

/** Optimizer input -- only fields the math needs (per D-11) */
export interface OptimizerInput {
  rps: number;
  requestProfiles: Array<{
    name: string;
    latencyMs: number;
    ratio: number;
  }>;
  podCount: number;
  workersPerPod: number;
  maxBacklogPerPod: number;
  probes: ProbeParams;
}

/** Result of a single M/M/c/K computation */
export interface MMcKResult {
  rho: number;
  pBlock: number;
  wq: number;
  lq: number;
}

/** Result of a sweep computation (used by Plan 02) */
export interface SweepPoint {
  podCount: number;
  workersPerPod: number;
  totalWorkers: number;
  result: MMcKResult;
}

/** Result of knee detection (used by Plan 02) */
export interface KneeResult {
  kneeIndex: number | null;
  fallbackIndex: number | null;
  method: 'kneedle' | 'threshold';
}
