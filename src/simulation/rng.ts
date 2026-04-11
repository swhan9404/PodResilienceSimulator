import type { RequestProfile } from './types';

/**
 * Mulberry32 seedable PRNG. Returns a function that produces numbers in [0, 1).
 * Same seed always produces the same sequence.
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Select a request profile based on cumulative ratio thresholds.
 * rngValue should be in [0, 1). Returns last profile as fallback for
 * floating-point edge cases.
 */
export function selectProfile(profiles: RequestProfile[], rngValue: number): RequestProfile {
  let cumulative = 0;
  for (const profile of profiles) {
    cumulative += profile.ratio;
    if (rngValue < cumulative) {
      return profile;
    }
  }
  return profiles[profiles.length - 1];
}
