import type { SimulationConfig } from '../simulation/types';

export const DEMO_CONFIG: SimulationConfig = {
  podCount: 5,
  workersPerPod: 4,
  maxBacklogPerPod: 10,
  rps: 50,
  requestProfiles: [
    { name: 'normal', latencyMs: 200, ratio: 0.7, color: '#3B82F6' },
    { name: 'slow', latencyMs: 5000, ratio: 0.3, color: '#F97316' },
  ],
  livenessProbe: { periodSeconds: 10, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
  readinessProbe: { periodSeconds: 5, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
  initializeTimeMs: 30000,
  seed: 42,
};
