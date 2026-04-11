# Stack Research

**Domain:** Statistical optimizer (queuing theory math engine) for existing slow request simulator
**Researched:** 2026-04-11
**Confidence:** HIGH for "write it yourself" verdict; MEDIUM for uPlot annotation patterns

---

## Context: What already exists (do not re-research)

The v1.0 codebase is running on:
- React 19 + TypeScript ~5.7 + Vite 8 + Zustand 5 + uPlot 1.6.32 + Canvas 2D + Tailwind CSS 4
- 137 tests passing, ~4,967 LOC

The optimizer milestone adds a **pure math computation layer** on top of this stack. It does NOT add a server, worker thread, or new UI framework. The question is: what libraries (if any) are needed for queuing theory math, knee-point detection, and cost-vs-stability charting?

---

## Verdict Summary

| Capability | Verdict | Rationale |
|------------|---------|-----------|
| M/M/c / Erlang C math | **Write in TypeScript — no library** | Erlang C is ~50 lines of iterative math. Numerically stable without special libraries. |
| M/M/c/K finite-buffer extension | **Write in TypeScript — no library** | Steady-state probabilities via iterative recursion. ~30 more lines. |
| Knee-point / elbow detection | **Write in TypeScript — no library** | No mature JS/TS npm package exists. Kneedle algorithm is ~40 lines of normalized math. |
| Cost-vs-stability charting | **Reuse uPlot** (already installed) | uPlot supports multi-series with multiple y-axes and custom draw hooks for markers. |
| Results state | **Reuse Zustand** (already installed) | Optimizer config + results go in a new Zustand slice, same pattern as simulation. |

**No new npm dependencies are required.** The entire statistical optimizer is implementable in pure TypeScript using JavaScript's built-in `Math` object.

---

## Recommended Stack (New Additions Only)

### Core Technologies

No new core framework additions. Everything builds on the existing React + Zustand + uPlot stack.

### New Code Modules (TypeScript, zero-dependency)

| Module | Location | What It Does | Implementation Complexity |
|--------|----------|-------------|--------------------------|
| `QueueingModel` | `src/optimizer/queueing.ts` | M/M/c and M/M/c/K formulas: utilization, wait probability, mean queue length, blocking probability | ~80 lines |
| `InfraSearcher` | `src/optimizer/searcher.ts` | Sweeps (podCount × workersPerPod × maxBacklog) space, calls QueueingModel, builds result matrix | ~60 lines |
| `KneeDetector` | `src/optimizer/knee.ts` | Kneedle algorithm: normalize curve, compute deviation from chord, find max deviation point | ~50 lines |
| `useOptimizerStore` | `src/store/useOptimizerStore.ts` | Zustand store for optimizer input params + computed results, mirrors useSimulationStore pattern | ~80 lines |

### Supporting Libraries

No new libraries needed. Rationale for each category:

**Math library (mathjs, jstat, numeric):** All rejected. The queuing formulas needed are:
1. Erlang C probability: iterative factorial accumulation (avoid `n!` direct — use `prev * A/i` recursion)
2. M/M/c/K steady-state probabilities: closed-form summation
3. Derived metrics: mean wait, queue length, blocking rate

These are 5-7 scalar formulas. `mathjs` is 9.4MB unpacked. `jstat` is 706KB. Neither provides queuing-specific functions — you would still write the formulas yourself, just wrapping them in a math library for no benefit. Use `Math.pow`, `Math.exp`, and plain loops.

**Knee detection library:** No mature JS/TS package exists on npm (confirmed via search). Python libraries `kneed` and `Kneeliverse` are Python-only. The Kneedle algorithm from the original 2011 paper (Satopaa et al.) is straightforward to port: normalize x/y to [0,1], compute difference array `D[i] = y_norm[i] - x_norm[i]`, find index of maximum. The algorithm paper is freely available and the core is ~40 lines.

**Charting for cost-vs-stability curves:** uPlot 1.6.32 is already installed. It supports multiple series and multiple y-axes (confirmed in docs). For the knee-point marker, use uPlot's `hooks.draw` callback to paint a vertical line using the underlying Canvas 2D context directly — the same pattern already used in the existing `PodRenderer`. No additional charting library is needed.

---

## Implementation Details

### Queuing Math: Erlang C (M/M/c, infinite queue)

The key insight is to avoid computing `A^c / c!` directly — it overflows for `c > 170` in IEEE 754. Use the iterative recursion instead:

```typescript
// Numerically stable Erlang C: probability customer must wait
// λ = arrival rate, μ = service rate per server, c = number of servers (workers × pods)
export function erlangC(lambda: number, mu: number, c: number): number {
  const rho = lambda / mu;          // offered load in Erlangs
  const utilization = rho / c;      // per-server utilization (must be < 1 for stability)
  if (utilization >= 1) return 1;   // unstable system: all customers wait

  // Build A^c/c! iteratively to avoid overflow
  let term = 1;
  let sum = 1;  // sum of A^k/k! for k=0..c-1
  for (let k = 1; k < c; k++) {
    term *= rho / k;
    sum += term;
  }
  // Last term: A^c/c! * c/(c - rho)
  term *= rho / c;
  const erlangCTerm = term * (c / (c - rho));
  return erlangCTerm / (sum + erlangCTerm);
}
```

Confidence: HIGH. This is the standard iterative form documented in call-center staffing literature and confirmed numerically stable for c up to the thousands.

### Queuing Math: M/M/c/K (finite backlog)

For the simulator's model (workers = servers, maxBacklog = K - c), use the M/M/c/K steady-state probabilities. The blocking probability P_block = P_K tells us what fraction of requests get a 503 in steady state:

```typescript
export function mmcK(lambda: number, mu: number, c: number, K: number): {
  blockingProb: number;    // P(system full) = 503 rate
  meanQueueLength: number; // E[L_q]
  utilization: number;     // ρ = λ_eff / (c * μ)
} {
  // Compute steady-state probabilities π_n using birth-death recursion
  const a = lambda / mu;  // offered load
  const pi: number[] = new Array(K + 1);
  pi[0] = 1;
  for (let n = 1; n <= K; n++) {
    const servers = Math.min(n, c);
    pi[n] = pi[n - 1] * (a / servers);
  }
  const total = pi.reduce((s, v) => s + v, 0);
  for (let n = 0; n <= K; n++) pi[n] /= total;  // normalize

  const blockingProb = pi[K];
  let meanQueueLength = 0;
  for (let n = c + 1; n <= K; n++) meanQueueLength += (n - c) * pi[n];
  const effectiveLambda = lambda * (1 - blockingProb);
  const utilization = effectiveLambda / (c * mu);
  return { blockingProb, meanQueueLength, utilization };
}
```

Confidence: HIGH. Birth-death recursion for M/M/c/K is textbook (confirmed via Rossetti Simulation Modeling and Arena). The normalization step prevents overflow for any realistic K.

### Probe Worker Occupancy Adjustment

The simulator model has probes occupying workers. The effective service rate per worker must account for probe overhead:

```typescript
// Effective worker capacity = fraction of time NOT occupied by probes
// probeRate = 1/periodSeconds, probeDuration = timeoutSeconds (worst case)
// effectiveMu = baseMu * (1 - probeRate * probeDuration)
export function effectiveServiceRate(
  baseMuPerWorker: number,
  livenessProbe: { periodSeconds: number; timeoutSeconds: number },
  readinessProbe: { periodSeconds: number; timeoutSeconds: number },
): number {
  const livenessOccupancy = livenessProbe.timeoutSeconds / livenessProbe.periodSeconds;
  const readinessOccupancy = readinessProbe.timeoutSeconds / readinessProbe.periodSeconds;
  const freeCapacity = 1 - livenessOccupancy - readinessOccupancy;
  return baseMuPerWorker * Math.max(0, freeCapacity);
}
```

This is a first-order approximation, not exact. Flag this in the optimizer output as "assumes probe overhead is proportional."

### Knee Detection: Kneedle Algorithm

The Kneedle algorithm (Satopaa et al., 2011) finds the point of maximum deviation from the chord connecting the first and last data points:

```typescript
// Input: sorted arrays of x (e.g., worker count) and y (e.g., 503 rate)
// Output: index of the knee point in the arrays
export function findKnee(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  // Normalize to [0, 1]
  const xMin = x[0], xMax = x[n - 1];
  const yMin = Math.min(...y), yMax = Math.max(...y);
  const xNorm = x.map(v => (v - xMin) / (xMax - xMin));
  const yNorm = y.map(v => (yMax - yMin) > 0 ? (v - yMin) / (yMax - yMin) : 0);

  // Difference from chord (y = x after normalization)
  const diff = xNorm.map((xi, i) => yNorm[i] - xi);

  // Find index of maximum deviation
  let maxIdx = 0;
  for (let i = 1; i < n; i++) {
    if (diff[i] > diff[maxIdx]) maxIdx = i;
  }
  return maxIdx;
}
```

Confidence: MEDIUM. This is a faithful port of the Kneedle paper's core, but the paper recommends smoothing for noisy data (moving average pre-processing). For this use case — a mathematically computed, monotone cost-vs-stability curve — the data will be clean and smoothing is unnecessary.

### uPlot: Knee-Point Marker

Use the existing uPlot instance's `hooks.draw` to annotate the knee point. No new library:

```typescript
// In the uPlot options object:
hooks: {
  draw: [(u) => {
    if (kneeXValue == null) return;
    const cx = Math.round(u.valToPos(kneeXValue, 'x', true));
    const ctx = u.ctx;
    ctx.save();
    ctx.strokeStyle = '#f59e0b';  // amber
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, u.bbox.top);
    ctx.lineTo(cx, u.bbox.top + u.bbox.height);
    ctx.stroke();
    ctx.restore();
  }],
}
```

Confidence: HIGH. This is a documented uPlot pattern via the `hooks.draw` API with direct Canvas 2D context access.

### uPlot: Dual Y-Axis (Cost + Stability)

The cost-vs-stability chart needs two y-axes on one x-axis (e.g., worker count on x, 503-rate on left y, infra-cost on right y):

```typescript
scales: { x: {}, '503rate': {}, cost: {} },
axes: [
  { scale: 'x', label: 'Workers (pods × workers/pod)' },
  { scale: '503rate', label: '503 Rate (%)', side: 3 },  // left
  { scale: 'cost', label: 'Infra Cost (relative)', side: 1 },  // right
],
series: [
  {},
  { scale: '503rate', stroke: '#ef4444', label: '503 Rate' },
  { scale: 'cost', stroke: '#3b82f6', label: 'Infra Cost' },
]
```

Confidence: HIGH. Multi-scale/multi-axis is a core uPlot feature documented in the official README and demos.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| mathjs (15.2.0, 9.4MB) | Provides no queuing-specific functions. You write the formulas either way. Bundle cost is extreme for 5 scalar functions. | Plain TypeScript math |
| jstat (1.9.6, 706KB) | Statistical distributions but no queuing models. Overkill for the formulas needed here. | Plain TypeScript math |
| Pyodide / Python WASM | 8MB+ download, complex setup, no offline support. Server constraint prohibits it anyway. | Plain TypeScript math |
| kneed (Python) | Python-only. Cannot run in browser. | Port Kneedle algorithm (~40 lines TypeScript) |
| Recharts / Chart.js | Already rejected for v1.0. Optimizer charts have same requirements (static, not streaming). uPlot handles it. | uPlot (already installed) |
| React Router | New optimizer is a tab/panel in the existing SPA, not a new page route. Use Zustand tab state or conditional rendering. | Conditional rendering + Zustand |
| Web Workers | Optimizer computation sweeps O(podCount × workers × backlog) combinations. For typical ranges (5-50 pods, 1-32 workers, 0-100 backlog), that's ~150,000 combinations max, each a handful of arithmetic ops — completes in <50ms synchronously. No worker thread needed. | Synchronous TypeScript |

---

## Alternatives Considered

| Category | Recommended | Alternative | When Alternative is Better |
|----------|-------------|-------------|---------------------------|
| Queuing math | Plain TypeScript | mathjs | If project needs symbolic math, matrix ops, or complex numbers. Not this project. |
| Knee detection | Port Kneedle to TS | Kneeliverse (Python) | If running Node.js backend where Python interop is available. Not applicable (SPA constraint). |
| Knee detection | Port Kneedle to TS | Deep learning approach (2024 paper) | If curve is noisy/real-world data. Mathematical optimizer curves are smooth by construction. Overkill. |
| Optimizer charting | uPlot | Custom Canvas 2D | If needing animations, drag/zoom interactions on the optimizer chart. uPlot gives zoom for free; use it. |
| Optimizer state | New Zustand slice | React useState | If optimizer results are only needed in one component. They span multiple components (input panel, chart, results table), so Zustand is correct. |

---

## Integration Points with Existing Stack

| Existing Component | How Optimizer Integrates |
|--------------------|--------------------------|
| `useSimulationStore.ts` | Optimizer reads `config.requestProfiles`, `livenessProbe`, `readinessProbe` from this store to pre-populate optimizer inputs. Use `useSimulationStore.getState()` — no prop drilling. |
| `src/simulation/types.ts` | Optimizer reuses `SimulationConfig`, `RequestProfile`, `ProbeConfig` types directly. No new types needed for input params. |
| uPlot (already installed) | Optimizer chart is a new `<UplotReact>` component with multi-scale config. Same `uplot-react` wrapper already used for metrics charts. |
| Tailwind CSS 4 | Optimizer panel uses same utility classes as simulation parameter panel. No new CSS. |
| Vitest | Queuing math functions are pure (no side effects, no DOM). Test them directly with `expect(erlangC(...)).toBeCloseTo(...)`. |

---

## Version Compatibility

| Package | Version in Repo | Notes |
|---------|----------------|-------|
| uplot | ^1.6.32 | Multi-axis, `hooks.draw`, `valToPos` — all available since 1.6.x |
| uplot-react | ^1.2.4 | Peer dep React >=16.8 — compatible with React 19 |
| zustand | ^5.0.12 | New slice for optimizer state uses same `create()` pattern |
| typescript | ~5.7 | All optimizer code is plain arithmetic, no new TS features needed |

---

## Sources

- [M/M/c queue — Wikipedia](https://en.wikipedia.org/wiki/M/M/c_queue) — Erlang C formula, M/M/c/K steady-state probabilities, birth-death recursion
- [Finding a Kneedle in a Haystack (Satopaa et al., 2011)](https://raghavan.usc.edu/papers/kneedle-simplex11.pdf) — Original Kneedle algorithm paper, normalization and deviation approach
- [Kneeliverse paper (ScienceDirect 2025)](https://www.sciencedirect.com/science/article/pii/S2352711025001281) — Confirms no JS/TS port exists; Python-only
- [uPlot GitHub README](https://github.com/leeoniya/uPlot/blob/master/docs/README.md) — Multi-scale/multi-axis API, hooks.draw pattern
- [uPlot annotation issue #27](https://github.com/leeoniya/uPlot/issues/27) — Community patterns for vertical line annotations via hooks
- [Erlang C overflow and iterative computation (callcentrehelper.com)](https://www.callcentrehelper.com/erlang-c-formula-example-121281.htm) — Numerically stable iterative approach
- [mathjs custom bundling docs](https://mathjs.org/docs/custom_bundling.html) — Confirmed 9.4MB unpacked; tree-shaking reduces but still large for 5 formulas
- npm registry — jstat@1.9.6 (706KB), mathjs@15.2.0 (9.4MB), verified 2026-04-11

---

*Stack research for: Statistical optimizer (queuing theory) additions to slow-request-simulator v1.1*
*Researched: 2026-04-11*
