import { describe, it, expect } from 'vitest';
import { computeSweep } from './sweep';
import type { OptimizerInput } from './types';

const basicInput: OptimizerInput = {
  rps: 100,
  requestProfiles: [{ name: 'normal', latencyMs: 200, ratio: 1.0 }],
  podCount: 5,
  workersPerPod: 4,
  maxBacklogPerPod: 10,
  probes: {
    livenessProbe: { periodSeconds: 10 },
    readinessProbe: { periodSeconds: 5 },
  },
};

describe('computeSweep', () => {
  it('returns an array of SweepPoint objects', () => {
    const result = computeSweep(basicInput);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('podCount');
    expect(result[0]).toHaveProperty('workersPerPod');
    expect(result[0]).toHaveProperty('totalWorkers');
    expect(result[0]).toHaveProperty('result');
  });

  it('returns results sorted by totalWorkers ascending', () => {
    const result = computeSweep(basicInput);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].totalWorkers).toBeLessThanOrEqual(result[i + 1].totalWorkers);
    }
  });

  it('has valid SweepPoint fields for every point', () => {
    const result = computeSweep(basicInput);
    for (const pt of result) {
      expect(pt.podCount).toBeGreaterThanOrEqual(1);
      expect(pt.workersPerPod).toBeGreaterThanOrEqual(1);
      expect(pt.totalWorkers).toBe(pt.podCount * pt.workersPerPod);
    }
  });

  it('grid size is <= 500 for default config (rps=2350, avgLatency~180ms)', () => {
    const input: OptimizerInput = {
      rps: 2350,
      requestProfiles: [
        { name: 'normal', latencyMs: 100, ratio: 0.7 },
        { name: 'slow', latencyMs: 500, ratio: 0.3 },
      ],
      podCount: 10,
      workersPerPod: 8,
      maxBacklogPerPod: 20,
      probes: {
        livenessProbe: { periodSeconds: 10 },
        readinessProbe: { periodSeconds: 5 },
      },
    };
    const result = computeSweep(input);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.length).toBeGreaterThan(0);
  });

  it('grid size is <= 500 for extreme input (rps=10000, latency=5000ms)', () => {
    const input: OptimizerInput = {
      rps: 10000,
      requestProfiles: [{ name: 'extreme', latencyMs: 5000, ratio: 1.0 }],
      podCount: 10,
      workersPerPod: 8,
      maxBacklogPerPod: 20,
      probes: {
        livenessProbe: { periodSeconds: 10 },
        readinessProbe: { periodSeconds: 5 },
      },
    };
    const result = computeSweep(input);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.length).toBeGreaterThan(0);
  });

  it('auto-range covers the stability boundary', () => {
    const result = computeSweep(basicInput);
    const hasUnstable = result.some((pt) => pt.result.rho >= 1);
    const hasStable = result.some((pt) => pt.result.rho < 1);
    expect(hasUnstable).toBe(true);
    expect(hasStable).toBe(true);
  });

  it('range override works', () => {
    const result = computeSweep(basicInput, {
      podRange: [2, 4],
      workerRange: [3, 5],
    });
    expect(result.length).toBe(9); // 3 pods * 3 workers
    for (const pt of result) {
      expect(pt.podCount).toBeGreaterThanOrEqual(2);
      expect(pt.podCount).toBeLessThanOrEqual(4);
      expect(pt.workersPerPod).toBeGreaterThanOrEqual(3);
      expect(pt.workersPerPod).toBeLessThanOrEqual(5);
    }
  });

  it('very low RPS produces at least 1 sweep point', () => {
    const input: OptimizerInput = {
      rps: 1,
      requestProfiles: [{ name: 'fast', latencyMs: 50, ratio: 1.0 }],
      podCount: 1,
      workersPerPod: 1,
      maxBacklogPerPod: 5,
      probes: {
        livenessProbe: { periodSeconds: 10 },
        readinessProbe: { periodSeconds: 5 },
      },
    };
    const result = computeSweep(input);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
