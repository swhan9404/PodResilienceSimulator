# Phase 5: Math Engine - Research

**Researched:** 2026-04-12
**Domain:** Queuing theory (M/M/c/K), numerical computation, knee point detection
**Confidence:** HIGH

## Summary

Phase 5 implements a pure TypeScript math library in `src/optimizer/` that computes infrastructure stability metrics using M/M/c/K queuing theory. The library exports three stateless functions: `computeMMcK()` for single-configuration analysis, `computeSweep()` for parameter grid evaluation, and `findKneePoint()` for cost-efficiency inflection detection. No new npm dependencies are needed -- all math is implementable in ~150-200 lines of TypeScript using iterative formulas that avoid factorial overflow.

The critical numerical challenge is computing Erlang-family formulas at extreme parameters (c=20, rho=0.99) without producing NaN or Infinity. The well-known Erlang B iterative recursion `E(n,a) = a*E(n-1,a) / (n + a*E(n-1,a))` is numerically stable for all practical inputs and forms the foundation. The M/M/c/K state probabilities are computed using incremental ratio accumulation, never computing raw factorials. The Kneedle algorithm for knee detection is a ~40-line implementation that normalizes data, computes a difference curve, and finds the point of maximum deviation from the diagonal.

**Primary recommendation:** Implement all three functions as pure functions with iterative (not recursive/factorial) numerical methods. Test against textbook values for known M/M/c/K configurations. The Kneedle algorithm should be implemented inline (~40 LOC) rather than ported from a library.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use effective capacity reduction: `c_eff = c - (probe_rate * probe_duration * num_probe_types)`. Subtract probe duty cycle from available workers per pod.
- **D-02:** Hardcode probe processing time to 1ms, matching the simulator's fixed probe duration.
- **D-03:** Model worker occupancy only -- do not attempt to model backlog displacement by probes. Keep the correction simple for v1.1.
- **D-04:** Knee detection curve axes: X = total workers (podCount x workersPerPod, cost proxy), Y = blocking probability (P_block).
- **D-05:** Fallback when no knee exists: percentile threshold -- return smallest configuration where P_block < 1% (0.01).
- **D-06:** Default P_block threshold for fallback: 1% (0.01), matching industry-standard SLA targets.
- **D-07:** Sweep ranges auto-derived from input RPS and request profile. No hardcoded ranges -- compute sensible min/max from traffic parameters.
- **D-08:** Uniform step size (+1) for both workersPerPod and podCount dimensions. Auto-ranges keep grids small enough (<500 points) for instant computation.
- **D-09:** Fixed maxBacklog -- sweep only workersPerPod x podCount as MATH-03 specifies. maxBacklog stays at input value (K in M/M/c/K).
- **D-10:** Standalone pure functions -- export `computeMMcK()`, `computeSweep()`, `findKneePoint()` as independent functions. No class, no state.
- **D-11:** Own input type (`OptimizerInput`) with only the fields the math needs. Decoupled from `SimulationConfig`. Phase 7 maps between them.
- **D-12:** Files live in `src/optimizer/` -- new top-level directory alongside `src/simulation/` and `src/visualization/`.

### Claude's Discretion
- Internal numeric precision choices (e.g., convergence thresholds for iterative Erlang C)
- Kneedle sensitivity parameter tuning
- Auto-range multiplier for sweep bounds derivation
- Internal function decomposition within `src/optimizer/`

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATH-01 | Given traffic conditions (RPS, request profile), compute P_block, Wq, rho using M/M/c/K | M/M/c/K formulas with iterative state probability computation; probe correction via D-01 |
| MATH-02 | Reflect health check probe worker occupancy in effective service rate | Effective capacity reduction formula c_eff = c - probe_duty_cycle per D-01/D-02/D-03 |
| MATH-03 | Auto-sweep workersPerPod x podCount range, compute stability metrics for each combination | Grid generation with auto-derived ranges per D-07/D-08; computeSweep() returns sorted array |
| MATH-04 | Kneedle algorithm for knee point detection on cost vs stability curve | Kneedle implementation (~40 LOC) with percentile-threshold fallback per D-05/D-06 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.7 | Type-safe math implementation | Already in project, pure TS functions need no additional runtime | [VERIFIED: package.json] |
| Vitest | ^4.1.4 | Unit testing math functions | Already in project, test patterns established | [VERIFIED: package.json] |

### Supporting
No new libraries needed. All queuing formulas are implementable in plain TypeScript. [VERIFIED: REQUIREMENTS.md explicitly excludes mathjs/jstat]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled M/M/c/K | mathjs or jstat npm packages | Excluded by project decision -- queuing formulas are ~80 LOC, adding 500KB+ library for 3 formulas is wasteful |
| Hand-rolled Kneedle | No npm package exists for JS/TS | No alternative available -- must implement inline |

## Architecture Patterns

### Recommended Project Structure
```
src/
  optimizer/
    types.ts           # OptimizerInput, OptimizerResult, SweepResult, KneeResult
    queuing.ts         # computeMMcK() - M/M/c/K formulas + probe correction
    sweep.ts           # computeSweep() - parameter grid generation + batch computation
    kneedle.ts         # findKneePoint() - Kneedle algorithm + fallback
    index.ts           # Public re-exports
    queuing.test.ts    # Textbook value verification
    sweep.test.ts      # Grid generation + sorting tests
    kneedle.test.ts    # Knee detection + fallback edge cases
```

### Pattern 1: Iterative Ratio Computation for M/M/c/K
**What:** Compute state probabilities as ratios P_n/P_0 iteratively, accumulating a running sum for the normalization constant P_0, then derive P_K (blocking probability) without ever computing raw factorials.
**When to use:** Always -- this is the only numerically stable approach for c >= 18.
**Example:**
```typescript
// Source: Erlang B recursion from https://www.cas.mcmaster.ca/~qiao/publications/erlang/erlang.html
// Extended to M/M/c/K using ratio accumulation from
// https://rossetti.github.io/RossettiArenaBook/app-qt-sec-formulas.html

interface MMcKResult {
  rho: number;          // server utilization lambda/(c*mu)
  pBlock: number;       // P_K, blocking probability
  wq: number;           // mean waiting time in queue
  lq: number;           // mean queue length
}

function computeMMcK(
  lambda: number,       // arrival rate (requests/sec)
  mu: number,           // service rate per server (1/avg_latency)
  c: number,            // number of servers (workers)
  K: number,            // total system capacity (c + backlog)
): MMcKResult {
  const r = lambda / mu;             // offered load (Erlang)
  const rho = lambda / (c * mu);     // per-server utilization

  // Compute P_n/P_0 ratios iteratively (no factorials)
  // For n=0..c: ratio_n = r^n / n!
  // For n=c+1..K: ratio_n = r^n / (c! * c^(n-c))
  let sumRatios = 1.0;   // ratio_0 = 1
  let ratio = 1.0;

  for (let n = 1; n <= c; n++) {
    ratio *= r / n;
    sumRatios += ratio;
  }

  const ratioAtC = ratio; // = r^c / c!
  for (let n = c + 1; n <= K; n++) {
    ratio *= r / c;        // = r^n / (c! * c^(n-c))
    sumRatios += ratio;
  }

  const p0 = 1.0 / sumRatios;
  const pK = ratio * p0;  // blocking probability

  // Lq computation (mean queue length)
  let lq: number;
  if (Math.abs(rho - 1.0) < 1e-10) {
    // rho == 1 special case
    lq = (ratioAtC * (K - c) * (K - c + 1)) / (2) * p0;
  } else {
    lq = (ratioAtC * rho * p0) / ((1 - rho) * (1 - rho))
      * (1 - Math.pow(rho, K - c) - (K - c) * Math.pow(rho, K - c) * (1 - rho));
  }

  // Effective arrival rate (accounts for blocked customers)
  const lambdaEff = lambda * (1 - pK);
  // Wq = Lq / lambdaEff (Little's law)
  const wq = lambdaEff > 0 ? lq / lambdaEff : 0;

  return { rho, pBlock: pK, wq, lq };
}
```

### Pattern 2: Probe Occupancy Correction
**What:** Reduce effective server count by the fraction of time probes occupy workers.
**When to use:** For MATH-02 -- always applied before calling M/M/c/K computation.
**Example:**
```typescript
// Per D-01, D-02, D-03:
// c_eff = c - (probe_rate * probe_duration * num_probe_types)
// probe_duration = 1ms = 0.001s (D-02)
// num_probe_types = 2 (liveness + readiness)
// probe_rate per type = 1 / periodSeconds

function computeEffectiveWorkers(
  workersPerPod: number,
  livenessProbe: { periodSeconds: number },
  readinessProbe: { periodSeconds: number },
): number {
  const probeDurationSec = 0.001; // 1ms per D-02
  const livenessRate = 1 / livenessProbe.periodSeconds;
  const readinessRate = 1 / readinessProbe.periodSeconds;
  const probeDutyCycle = (livenessRate + readinessRate) * probeDurationSec;
  return workersPerPod - probeDutyCycle;
}
```

### Pattern 3: Kneedle Algorithm (Simplified Offline)
**What:** Normalize X/Y to [0,1], compute difference curve (y_norm - x_norm), find local max of difference curve as knee candidate.
**When to use:** For MATH-04 on the sweep results (X=total workers, Y=P_block).
**Example:**
```typescript
// Source: Satopaa et al. 2011 "Finding a Kneedle in a Haystack"
// Simplified for offline, decreasing-concave curves (P_block decreases as workers increase)

function findKneePoint(
  xs: number[],    // total workers (ascending)
  ys: number[],    // P_block (descending)
  sensitivity: number = 1.0,
): number | null {
  if (xs.length < 3) return null;

  // Step 1: Normalize to [0, 1]
  const xMin = xs[0], xMax = xs[xs.length - 1];
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const xn = xs.map(x => (x - xMin) / xRange);
  const yn = ys.map(y => (y - yMin) / yRange);

  // Step 2: For decreasing curve, flip y: yn_flipped = 1 - yn
  // Then difference = yn_flipped - xn
  const diff = yn.map((y, i) => (1 - y) - xn[i]);

  // Step 3: Find local maxima of difference curve
  const threshold = sensitivity * (1 / xs.length);
  let bestIdx = -1;
  let bestVal = -Infinity;

  for (let i = 1; i < diff.length - 1; i++) {
    if (diff[i] >= diff[i - 1] && diff[i] >= diff[i + 1]) {
      if (diff[i] > bestVal && diff[i] > threshold) {
        bestVal = diff[i];
        bestIdx = i;
      }
    }
  }

  return bestIdx >= 0 ? bestIdx : null;
}
```

### Anti-Patterns to Avoid
- **Computing factorials directly:** `n!` overflows at n=171 in JavaScript. Always use iterative ratio accumulation. [VERIFIED: Number.MAX_VALUE = ~1.8e308, 171! ~ 1.24e309]
- **Using Math.pow for large exponents:** `r^n` for large n causes overflow. Compute incrementally as `ratio *= r/n` or `ratio *= r/c`.
- **Normalizing after the full sum:** Compute running ratios, not raw probabilities then normalize. The running ratio approach keeps all intermediate values in a safe range.
- **Using scipy-style argrelextrema:** The Python kneed library uses scipy for local maxima. In TypeScript, a simple loop comparison is cleaner and has zero dependencies.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smoothing spline for Kneedle | Cubic spline interpolation | Skip smoothing entirely | Our sweep data is exact (no noise) -- smoothing is only needed for noisy/sampled data. Sweep produces deterministic points. |
| Matrix algebra for Markov chains | Q-matrix solver | Closed-form M/M/c/K formulas | M/M/c/K has analytical solutions; no need for general CTMC solvers |
| General-purpose optimization | Gradient descent / Newton's method | Exhaustive grid sweep | Grid is <500 points per D-08, exhaustive evaluation is faster than optimizer setup |

**Key insight:** This phase is all closed-form math with a small search space. Every formula has an analytical solution; no iterative solvers or approximation algorithms are needed (except Kneedle, which is itself a simple O(n) scan).

## Common Pitfalls

### Pitfall 1: Factorial Overflow in Erlang Computation
**What goes wrong:** Computing `r^c / c!` directly causes Infinity for c >= 171, and loses precision much earlier.
**Why it happens:** JavaScript's Number type has a max exponent of ~308. 171! exceeds this.
**How to avoid:** Use the iterative ratio approach: start with ratio=1, multiply by r/n at each step. The ratio stays bounded because r/n < 1 for n > r.
**Warning signs:** NaN or Infinity in test output, especially at c=20, rho=0.99 (success criterion #5).

### Pitfall 2: rho=1 Division by Zero in Lq Formula
**What goes wrong:** The Lq formula for M/M/c/K has (1-rho) in the denominator. When rho=1.0, this is zero.
**Why it happens:** The M/M/c/K model is valid at rho=1 (unlike M/M/c which requires rho<1), but the formula has a different form.
**How to avoid:** Check `Math.abs(rho - 1.0) < epsilon` and use the special-case formula: `Lq = r^c * (K-c)(K-c+1) / (2*c!) * P_0`.
**Warning signs:** NaN in Lq or Wq when rho is close to 1.0.

### Pitfall 3: Kneedle Fails on Monotone/Flat Curves
**What goes wrong:** When P_block is already 0 (or nearly 0) across the entire sweep, or when it's a straight line, Kneedle finds no local maximum in the difference curve.
**Why it happens:** All-zero or constant data produces a flat difference curve with no peaks.
**How to avoid:** Fallback to percentile threshold (D-05): return the smallest configuration where P_block < 0.01. This is required from the start, not as an afterthought.
**Warning signs:** `findKneePoint()` returning null. The caller must always handle null.

### Pitfall 4: Probe Correction Producing Negative Workers
**What goes wrong:** If probe duty cycle exceeds workersPerPod (e.g., 1 worker per pod with very frequent probes), c_eff becomes negative.
**Why it happens:** Aggressive probe settings with minimal workers. Unlikely in practice but must be guarded.
**How to avoid:** Clamp c_eff to `Math.max(c_eff, 0.01)` or similar small positive value. A system with c_eff <= 0 is fully probe-saturated (rho=Infinity, P_block=1).
**Warning signs:** NaN from division by zero when c_eff <= 0.

### Pitfall 5: Sweep Auto-Range Producing Empty or Huge Grids
**What goes wrong:** Edge-case inputs (very low RPS or extreme latencies) cause the auto-derived ranges to be empty (min > max) or enormous (thousands of points).
**Why it happens:** The auto-range formula may not account for all input combinations.
**How to avoid:** Clamp grid dimensions. Minimum range: at least 1 value per axis. Maximum: enforce D-08's <500 total points constraint. If derived range exceeds this, widen the step size or narrow the range.
**Warning signs:** Empty sweep results or computation taking more than a few milliseconds.

### Pitfall 6: Floating-Point Comparison in rho=1 Check
**What goes wrong:** `rho === 1.0` fails due to floating-point arithmetic (e.g., lambda=400, c=4, mu=100 gives rho=1.0000000000000002).
**Why it happens:** IEEE 754 floating-point representation.
**How to avoid:** Use epsilon comparison: `Math.abs(rho - 1.0) < 1e-10`.
**Warning signs:** Occasional NaN for inputs that should produce rho=1.

## Code Examples

### Example 1: Complete M/M/c/K with Probe Correction
```typescript
// Source: Formulas from https://rossetti.github.io/RossettiArenaBook/app-qt-sec-formulas.html
// Iterative approach from https://www.cas.mcmaster.ca/~qiao/publications/erlang/erlang.html

// See Pattern 1 and Pattern 2 above for full implementation.
// Key: compute ratios iteratively, handle rho=1 edge case, clamp c_eff > 0.
```

### Example 2: Sweep with Auto-Range Derivation
```typescript
// Auto-range derivation per D-07:
// Given lambda (RPS) and mu (1/avgLatency), the minimum workers needed
// for stability is ceil(lambda/mu). Use this as the lower bound.
// Upper bound: 2x the minimum (enough to show the knee region).

function deriveRange(lambda: number, mu: number): { minWorkers: number; maxWorkers: number } {
  const minForStability = Math.ceil(lambda / mu);
  return {
    minWorkers: Math.max(1, Math.floor(minForStability * 0.5)),
    maxWorkers: Math.ceil(minForStability * 2.5),
  };
}

// Grid: iterate podCount from 1..maxPods, workersPerPod from 1..maxWorkers
// Total points < 500 per D-08
```

### Example 3: Textbook Verification Values
```typescript
// M/M/1/1 (single server, no backlog): Erlang B loss system
// lambda=0.5, mu=1.0, c=1, K=1
// P_block = r / (1 + r) = 0.5 / 1.5 = 0.333...
// This is a known textbook result.

// M/M/c/K with c=2, K=4, lambda=3, mu=1:
// r = 3, rho = 3/2 = 1.5
// P_0 = [1 + 3 + 9/2 + 27/4 + 81/8]^-1 = [1 + 3 + 4.5 + 6.75 + 10.125]^-1
//      = 1/25.375 = 0.03941...
// P_K = P_4 = (81/8) * P_0 = 10.125 * 0.03941 = 0.3990...

// M/M/c with c=20, rho=0.99 (success criterion #5):
// This tests numerical stability. lambda = 19.8, mu = 1.0, c = 20
// With K large enough (e.g., K = c + 100), the system approximates M/M/c.
// Expected: finite values, no NaN/Infinity.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct factorial computation | Iterative ratio accumulation | Standard since ~1990s telecom work | Enables c > 170 without overflow |
| Ad-hoc knee detection | Kneedle algorithm (Satopaa 2011) | 2011 | Principled, parameter-tunable method |
| Separate Erlang B/C libraries | Inline iterative formulas | Always for small projects | No dependency needed for 3 formulas |

**Deprecated/outdated:**
- Using `Math.factorial()` or gamma functions for Erlang computation -- unnecessary and numerically dangerous for large c.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Kneedle sensitivity S=1.0 is a good default for P_block vs total_workers curves | Architecture Patterns / Pattern 3 | Low -- tunable parameter, easy to adjust in testing. S=1 is the paper's recommended default for offline mode. |
| A2 | Auto-range upper bound of 2.5x minimum workers is sufficient to capture the knee region | Code Examples / Example 2 | Medium -- if the knee occurs beyond 2.5x, it will be missed. Mitigated by the fallback threshold (D-05). |
| A3 | Smoothing spline is unnecessary for Kneedle on sweep data | Don't Hand-Roll | Low -- sweep data is deterministic (no noise). If results are jagged, smoothing can be added later. |
| A4 | Probe correction as simple duty-cycle subtraction (D-01) is accurate enough vs simulation | Phase Requirements / MATH-02 | Medium -- the simulator models probe-worker interaction in detail (backlog displacement, timeouts). The math engine uses a linear approximation. Success criterion #2 only requires "higher utilization than naive," which duty-cycle subtraction guarantees. |

## Open Questions

1. **What is the right auto-range multiplier for sweep bounds?**
   - What we know: Minimum workers for stability = ceil(lambda/mu). The knee typically occurs at 1.2-2x this value.
   - What's unclear: The exact multiplier that reliably captures the knee for all realistic input combinations.
   - Recommendation: Start with 0.5x-2.5x of minimum, validate against the default config (podCount=270, workersPerPod=4, rps=2350). Adjust if tests show the knee is outside the range.

2. **Should the sweep function accept a pre-computed range or always auto-derive?**
   - What we know: D-07 says auto-derived. Phase 7 (UI) may want to let users override.
   - What's unclear: Whether to support both modes now or defer override to Phase 7.
   - Recommendation: Accept optional range overrides in the function signature but default to auto-derivation. This adds ~3 lines and prevents a refactor later.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). Phase 5 is pure TypeScript math with no external tools, services, or runtimes beyond what's already installed and verified (Node.js, npm, Vitest).

## Project Constraints (from CLAUDE.md)

- **Tech Stack:** React 18 + TypeScript + Vite + Canvas -- browser-only SPA. Phase 5 is pure TS, no React dependency. [VERIFIED: CLAUDE.md]
- **No Server:** Static SPA. Math engine runs in browser. [VERIFIED: CLAUDE.md]
- **No new npm dependencies:** Explicitly excluded mathjs/jstat. [VERIFIED: REQUIREMENTS.md Out of Scope]
- **Test pattern:** Co-located test files (e.g., `queuing.test.ts` alongside `queuing.ts`). [VERIFIED: existing `src/simulation/*.test.ts` pattern]
- **Vitest config:** `environment: 'node'`, includes `src/**/*.test.ts`. New tests in `src/optimizer/` will be auto-discovered. [VERIFIED: vitest.config.ts]
- **Integer milliseconds:** Simulation uses integer ms for time. Optimizer input latencies should also be integer ms for consistency. [VERIFIED: types.ts comments]
- **Coding guidelines:** Simplicity first, no over-abstraction, surgical changes. Pure functions per D-10 align perfectly. [VERIFIED: CLAUDE.md Coding Guideline]

## Sources

### Primary (HIGH confidence)
- [M/M/c queue - Wikipedia](https://en.wikipedia.org/wiki/M/M/c_queue) - M/M/c/K state probability formulas, blocking probability definition
- [Rossetti - Summary of Queueing Formulas](https://rossetti.github.io/RossettiArenaBook/app-qt-sec-formulas.html) - P_0, P_n, Lq formulas for M/M/c/K with rho=1 special case
- [McMaster Robust Erlang B Calculator](https://www.cas.mcmaster.ca/~qiao/publications/erlang/erlang.html) - Iterative Erlang B recursion avoiding factorial overflow
- [Satopaa et al. 2011 - "Finding a Kneedle in a Haystack"](https://raghavan.usc.edu/papers/kneedle-simplex11.pdf) - Original Kneedle algorithm paper
- [arvkevi/kneed GitHub](https://github.com/arvkevi/kneed) - Reference Python implementation of Kneedle (used for algorithm verification)
- Project codebase: `src/simulation/types.ts`, `src/simulation/engine.ts`, `src/store/useSimulationStore.ts` - Existing types and patterns

### Secondary (MEDIUM confidence)
- [Call Centre Helper - Erlang C Formula](https://www.callcentrehelper.com/erlang-c-formula-example-121281.htm) - Practical Erlang C examples
- [Kneedle R package documentation](https://etam4260.github.io/kneedle/index.html) - Algorithm step descriptions

### Tertiary (LOW confidence)
- None. All claims verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all tools already in project
- Architecture: HIGH - Pure functions, iterative formulas, well-understood math
- Pitfalls: HIGH - Numerical overflow is the #1 documented issue in Erlang computation literature; all mitigations are established techniques
- Kneedle implementation: MEDIUM - No existing JS/TS implementation to reference; porting from Python kneed library is straightforward but untested in this context

**Research date:** 2026-04-12
**Valid until:** Indefinite -- queuing theory formulas do not change. Kneedle algorithm is stable (2011 paper).
