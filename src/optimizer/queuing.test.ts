import { describe, it, expect } from 'vitest';
import { computeMMcK, computeEffectiveWorkers } from './queuing';

describe('computeMMcK', () => {
  it('M/M/1/1 Erlang B loss: pBlock = 0.3333', () => {
    // lambda=0.5, mu=1.0, c=1, K=1
    // P_block = r/(1+r) = 0.5/1.5 = 0.3333
    const result = computeMMcK(0.5, 1.0, 1, 1);
    expect(result.rho).toBeCloseTo(0.5, 4);
    expect(result.pBlock).toBeCloseTo(1 / 3, 4);
  });

  it('M/M/2/4 textbook: pBlock = 0.3990', () => {
    // c=2, K=4, lambda=3, mu=1
    // r=3, rho=1.5
    // P_0 = 1/(1 + 3 + 4.5 + 6.75 + 10.125) = 1/25.375 = 0.03941
    // P_4 = 10.125 * P_0 = 0.3990
    const result = computeMMcK(3, 1, 2, 4);
    expect(result.rho).toBeCloseTo(1.5, 4);
    expect(result.pBlock).toBeCloseTo(0.3990, 3);
  });

  it('numerical stability: c=20, rho=0.99 produces finite values', () => {
    // lambda=19.8, mu=1.0, c=20, K=120
    const result = computeMMcK(19.8, 1.0, 20, 120);
    expect(Number.isFinite(result.rho)).toBe(true);
    expect(Number.isFinite(result.pBlock)).toBe(true);
    expect(Number.isFinite(result.wq)).toBe(true);
    expect(Number.isFinite(result.lq)).toBe(true);
    expect(result.rho).toBeCloseTo(0.99, 2);
  });

  it('rho=1 edge case: finite Lq and Wq', () => {
    // lambda=2, mu=1, c=2, K=4 -> rho = 2/(2*1) = 1.0
    const result = computeMMcK(2, 1, 2, 4);
    expect(Number.isFinite(result.lq)).toBe(true);
    expect(Number.isFinite(result.wq)).toBe(true);
    expect(result.rho).toBeCloseTo(1.0, 10);
    expect(result.lq).toBeGreaterThan(0);
  });

  it('lambda=0 guard: returns zeros', () => {
    const result = computeMMcK(0, 1, 2, 4);
    expect(result.rho).toBe(0);
    expect(result.pBlock).toBe(0);
    expect(result.wq).toBe(0);
    expect(result.lq).toBe(0);
  });

  it('invalid c<=0 guard: returns degenerate values', () => {
    const result = computeMMcK(1, 1, 0, 4);
    expect(result.pBlock).toBe(1);
    expect(result.rho).toBe(Infinity);
  });

  it('invalid mu<=0 guard: returns degenerate values', () => {
    const result = computeMMcK(1, 0, 2, 4);
    expect(result.pBlock).toBe(1);
    expect(result.rho).toBe(Infinity);
  });

  it('invalid K<=0 guard: returns degenerate values', () => {
    const result = computeMMcK(1, 1, 2, 0);
    expect(result.pBlock).toBe(1);
    expect(result.rho).toBe(Infinity);
  });
});

describe('computeEffectiveWorkers', () => {
  it('returns c_eff = 4 - (0.1 + 0.2) * 0.001 = 3.9997', () => {
    const result = computeEffectiveWorkers(4, {
      livenessProbe: { periodSeconds: 10 },
      readinessProbe: { periodSeconds: 5 },
    });
    expect(result).toBeCloseTo(3.9997, 6);
  });

  it('clamps to 0.01 when probe duty cycle exceeds workersPerPod', () => {
    // Very frequent probes with tiny worker count
    const result = computeEffectiveWorkers(0.0001, {
      livenessProbe: { periodSeconds: 0.001 },
      readinessProbe: { periodSeconds: 0.001 },
    });
    expect(result).toBe(0.01);
  });

  it('probe correction produces higher rho than raw workers', () => {
    const lambda = 3;
    const mu = 1;
    const rawC = 4;
    const K = 8;

    const cEff = computeEffectiveWorkers(rawC, {
      livenessProbe: { periodSeconds: 10 },
      readinessProbe: { periodSeconds: 5 },
    });

    const resultRaw = computeMMcK(lambda, mu, rawC, K);
    const resultCorrected = computeMMcK(lambda, mu, cEff, K);

    expect(cEff).toBeLessThan(rawC);
    expect(resultCorrected.rho).toBeGreaterThan(resultRaw.rho);
  });
});
