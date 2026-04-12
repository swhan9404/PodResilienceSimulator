import { describe, it, expect } from 'vitest';
import { findKneePoint } from './kneedle';

describe('findKneePoint', () => {
  it('finds a valid knee on a 1/x curve', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = xs.map((x) => 1 / x);
    const result = findKneePoint(xs, ys);
    expect(result.kneeIndex).not.toBeNull();
    expect(result.kneeIndex).toBeGreaterThanOrEqual(1);
    expect(result.kneeIndex).toBeLessThanOrEqual(4);
    expect(result.method).toBe('kneedle');
  });

  it('finds knee on a decreasing concave curve', () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const ys = [0.5, 0.2, 0.08, 0.03, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002];
    const result = findKneePoint(xs, ys);
    expect(result.kneeIndex).not.toBeNull();
  });

  it('returns null kneeIndex for flat curve (all zeros)', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [0, 0, 0, 0, 0];
    const result = findKneePoint(xs, ys);
    expect(result.kneeIndex).toBeNull();
  });

  it('returns null kneeIndex for linear decrease', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    const result = findKneePoint(xs, ys);
    expect(result.kneeIndex).toBeNull();
  });

  it('fallback selects smallest index where Y < 0.01', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [0.5, 0.1, 0.05, 0.009, 0.001];
    const result = findKneePoint(xs, ys);
    expect(result.fallbackIndex).toBe(3);
  });

  it('fallback returns null when all Y values >= 0.01', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [0.5, 0.3, 0.1, 0.05, 0.02];
    const result = findKneePoint(xs, ys);
    expect(result.fallbackIndex).toBeNull();
  });

  it('returns null kneeIndex for fewer than 3 data points', () => {
    const xs = [1, 2];
    const ys = [0.5, 0.1];
    const result = findKneePoint(xs, ys);
    expect(result.kneeIndex).toBeNull();
    expect(result.method).toBe('threshold');
  });

  it('method is kneedle when knee found, threshold when fallback used', () => {
    // Knee found case
    const xs1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys1 = xs1.map((x) => 1 / x);
    const r1 = findKneePoint(xs1, ys1);
    expect(r1.method).toBe('kneedle');

    // No knee case
    const xs2 = [1, 2, 3, 4, 5];
    const ys2 = [0, 0, 0, 0, 0];
    const r2 = findKneePoint(xs2, ys2);
    expect(r2.method).toBe('threshold');
  });

  it('custom threshold changes fallback behavior', () => {
    const xs = [1, 2, 3];
    const ys = [0.5, 0.09, 0.01];
    // Default threshold 0.01: fallback should be null (0.01 is not < 0.01)
    const r1 = findKneePoint(xs, ys);
    expect(r1.fallbackIndex).toBeNull();

    // Custom threshold 0.1: fallback should be index 1 (0.09 < 0.1)
    const r2 = findKneePoint(xs, ys, undefined, 0.1);
    expect(r2.fallbackIndex).toBe(1);
  });
});
