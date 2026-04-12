---
phase: 05-math-engine
reviewed: 2026-04-12T12:03:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/optimizer/index.ts
  - src/optimizer/kneedle.test.ts
  - src/optimizer/kneedle.ts
  - src/optimizer/queuing.test.ts
  - src/optimizer/queuing.ts
  - src/optimizer/sweep.test.ts
  - src/optimizer/sweep.ts
  - src/optimizer/types.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-04-12T12:03:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The optimizer module implements M/M/c/K queuing theory, a parameter sweep grid, and Kneedle knee-point detection. The code is well-structured, thoroughly tested (28 tests, all passing), and numerically stable for the primary use cases. Types are clean and exports are well-organized.

Key concerns are: (1) `computeMMcK` receives a non-integer `c` from probe duty-cycle correction in `sweep.ts`, which causes a state to be skipped in the iterative probability computation; (2) `computeMMcK` produces incorrect `Lq` when `c > K` due to negative `K - c`; (3) the sweep grid cap of 500 points is not enforced when `rangeOverride` is supplied; (4) `computeEffectiveWorkers` does not guard against `periodSeconds = 0`.

## Warnings

### WR-01: Non-integer `c` causes skipped state in M/M/c/K probability sum

**File:** `src/optimizer/queuing.ts:35-46` (triggered from `src/optimizer/sweep.ts:57`)
**Issue:** `computeMMcK` uses `for (let n = 1; n <= c; n++)` and `for (let n = c + 1; n <= K; n++)` with a float `c` value. When `computeEffectiveWorkers` returns a non-integer (e.g., `3.9997`), state n=4 falls between the two loops and is excluded from `sumRatios`. This skews P_0 and all derived metrics (pBlock, Lq, Wq). Verified: `sumRatios` for `c=3.9997` is 22.23 vs 23.30 for `c=4`, a ~5% error in the normalizing constant.

In practice, the probe correction is tiny (~0.0003 workers), so the numerical impact is small. But the code is structurally incorrect for non-integer inputs.

**Fix:** Floor the `c` parameter in `computeMMcK`, or floor it in `sweep.ts` before the call. The M/M/c/K model is defined for integer servers. Apply the fractional reduction only to `rho` if desired.

```typescript
// Option A: Floor in sweep.ts (recommended -- keeps computeMMcK pure)
// In sweep.ts line 57-61:
const cEff = computeEffectiveWorkers(w, input.probes);
const totalCRaw = cEff * pod;
const totalC = Math.floor(totalCRaw);       // Integer servers for M/M/c/K
const totalK = (w + input.maxBacklogPerPod) * pod;
const result = computeMMcK(input.rps, mu, totalC, totalK);

// Option B: Guard in computeMMcK itself
export function computeMMcK(lambda: number, mu: number, c: number, K: number): MMcKResult {
  c = Math.floor(c); // M/M/c/K requires integer c
  // ... rest of function
}
```

### WR-02: Incorrect Lq when `c > K`

**File:** `src/optimizer/queuing.ts:52-60`
**Issue:** When `c > K`, `K - c` is negative. The Lq formula computes `Math.pow(rho, K - c)` with a negative exponent and uses `(K - c)` as a multiplier, producing a spurious positive Lq. Verified: `computeMMcK(5, 1, 10, 5)` returns `lq = 1.80` when it should be 0 (no queue slots exist).

In the current codebase, `sweep.ts` always produces `K >= c` (since `totalK = (w + maxBacklogPerPod) * pod >= w * pod >= cEff * pod = totalC`), so this bug is not triggered in practice. However, `computeMMcK` is a public export and could be called directly with `c > K`.

**Fix:** Add a guard for `K <= c` (no queue capacity):

```typescript
// After line 52, before the Lq computation:
if (K <= c) {
  // No queue slots -- Lq and Wq are zero
  const lambdaEff = lambda * (1 - pK);
  return { rho, pBlock: pK, wq: 0, lq: 0 };
}
```

### WR-03: Sweep grid cap not enforced for `rangeOverride`

**File:** `src/optimizer/sweep.ts:44`
**Issue:** The `gridSize > MAX_GRID` check is guarded by `!rangeOverride`, so user-supplied range overrides can produce arbitrarily large grids. The docstring on line 9 states "Grid is always capped at 500 points per D-08" -- this is not upheld for overrides.

**Fix:** Either enforce the cap for all inputs, or update the docstring to clarify the override exception:

```typescript
// Option A: Always enforce (matches D-08 spec)
if (gridSize > MAX_GRID) {
  const maxPerAxis = Math.floor(Math.sqrt(MAX_GRID));
  podMax = Math.min(podMax, podMin + maxPerAxis - 1);
  workerMax = Math.min(workerMax, workerMin + maxPerAxis - 1);
}

// Option B: Document the exception (if override bypass is intentional)
// Update docstring: "Grid is capped at 500 points for auto-derived ranges.
// Explicit rangeOverride bypasses the cap."
```

### WR-04: Division by zero in `computeEffectiveWorkers` when `periodSeconds = 0`

**File:** `src/optimizer/queuing.ts:81-82`
**Issue:** If `livenessProbe.periodSeconds` or `readinessProbe.periodSeconds` is 0, computing `1 / 0` produces `Infinity`. The `Math.max(..., 0.01)` clamp prevents a crash, but the function silently swallows an invalid input. The `ProbeParams` type allows `number` with no constraint.

**Fix:** Guard against zero or negative period:

```typescript
export function computeEffectiveWorkers(
  workersPerPod: number,
  probes: ProbeParams,
): number {
  const probeDurationSec = 0.001;
  const livenessPeriod = Math.max(probes.livenessProbe.periodSeconds, 0.001);
  const readinessPeriod = Math.max(probes.readinessProbe.periodSeconds, 0.001);
  const livenessRate = 1 / livenessPeriod;
  const readinessRate = 1 / readinessPeriod;
  const probeDutyCycle = (livenessRate + readinessRate) * probeDurationSec;
  return Math.max(workersPerPod - probeDutyCycle, 0.01);
}
```

## Info

### IN-01: `Math.min/max(...ys)` spread limitation for large arrays

**File:** `src/optimizer/kneedle.ts:29-30`
**Issue:** `Math.min(...ys)` and `Math.max(...ys)` spread the array as function arguments. For arrays exceeding ~100K elements, this throws a `RangeError: Maximum call stack size exceeded`. Given the 500-point grid cap, this will never trigger in practice, but the pattern is fragile if the module is reused elsewhere.

**Fix:** Use a loop-based min/max or `reduce`:

```typescript
const yMin = ys.reduce((a, b) => Math.min(a, b), Infinity);
const yMax = ys.reduce((a, b) => Math.max(a, b), -Infinity);
```

### IN-02: Kneedle endpoint exclusion not documented

**File:** `src/optimizer/kneedle.ts:47`
**Issue:** The local maximum search (`for (let i = 1; i < diff.length - 1; i++)`) intentionally skips the first and last indices, which is standard for Kneedle. However, this means a knee at the boundary (e.g., when the curve has only 3-4 points and the knee is at index 0 or the last index) will never be detected. A brief comment would clarify intent.

**Fix:** Add a comment:

```typescript
// Scan interior points only -- endpoints cannot be local maxima per Kneedle algorithm
for (let i = 1; i < diff.length - 1; i++) {
```

---

_Reviewed: 2026-04-12T12:03:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
