import { describe, it, expect } from 'vitest';
import { createRng, selectProfile } from './rng';
import type { RequestProfile } from './types';

const testProfiles: RequestProfile[] = [
  { name: 'normal', latencyMs: 50, ratio: 0.80, color: '#4CAF50' },
  { name: 'slow-api', latencyMs: 5000, ratio: 0.15, color: '#FF9800' },
  { name: 'very-slow', latencyMs: 30000, ratio: 0.05, color: '#F44336' },
];

describe('createRng', () => {
  it('produces deterministic sequence for same seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);

    const seq1 = Array.from({ length: 5 }, () => rng1());
    const seq2 = Array.from({ length: 5 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  it('all values in [0, 1)', () => {
    const rng = createRng(12345);

    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const rng1 = createRng(1);
    const rng2 = createRng(2);

    expect(rng1()).not.toBe(rng2());
  });
});

describe('selectProfile', () => {
  it('rngValue=0.0 returns first profile', () => {
    expect(selectProfile(testProfiles, 0.0)).toBe(testProfiles[0]);
  });

  it('rngValue=0.79 returns first profile (cumulative 0.80)', () => {
    expect(selectProfile(testProfiles, 0.79)).toBe(testProfiles[0]);
  });

  it('rngValue=0.80 returns second profile', () => {
    expect(selectProfile(testProfiles, 0.80)).toBe(testProfiles[1]);
  });

  it('rngValue=0.94 returns second profile (cumulative 0.95)', () => {
    expect(selectProfile(testProfiles, 0.94)).toBe(testProfiles[1]);
  });

  it('rngValue=0.96 returns third profile', () => {
    expect(selectProfile(testProfiles, 0.96)).toBe(testProfiles[2]);
  });

  it('rngValue=0.999 returns last profile', () => {
    expect(selectProfile(testProfiles, 0.999)).toBe(testProfiles[2]);
  });

  it('distribution test: 10000 samples within 2% of expected ratio', () => {
    const rng = createRng(12345);
    const counts: Record<string, number> = { normal: 0, 'slow-api': 0, 'very-slow': 0 };

    for (let i = 0; i < 10000; i++) {
      const profile = selectProfile(testProfiles, rng());
      counts[profile.name]++;
    }

    // Expected: normal=8000, slow-api=1500, very-slow=500
    // Allow 2% tolerance (200 for normal, 200 for slow-api, 200 for very-slow)
    expect(counts['normal']).toBeGreaterThan(7800);
    expect(counts['normal']).toBeLessThan(8200);
    expect(counts['slow-api']).toBeGreaterThan(1300);
    expect(counts['slow-api']).toBeLessThan(1700);
    expect(counts['very-slow']).toBeGreaterThan(300);
    expect(counts['very-slow']).toBeLessThan(700);
  });
});
