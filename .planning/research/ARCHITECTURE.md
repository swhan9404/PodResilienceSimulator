# Architecture Research

**Domain:** Statistical optimizer integration into existing React simulation SPA
**Researched:** 2026-04-11
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
+---------------------------------------------------------------------+
|                          Browser (SPA)                              |
+-----------------------------+---------------------------------------+
|   Tab: Simulator (v1.0)     |   Tab: Optimizer (NEW - v1.1)        |
|                             |                                       |
|  +----------------------+   |  +--------------------------------+   |
|  |   ControlPanel       |   |  |   OptimizerPanel (NEW)         |   |
|  |   (params + ctrl)    |   |  |   TrafficInput + SweepBounds   |   |
|  +----------+-----------+   |  +---------------+----------------+   |
|             |               |                  |                    |
|  +----------v-----------+   |  +---------------v----------------+   |
|  |  useSimulationStore  |   |  |  useOptimizerStore (NEW)       |   |
|  |  (Zustand)           |   |  |  (Zustand, separate slice)     |   |
|  +----------+-----------+   |  +---------------+----------------+   |
|             |               |                  |                    |
|  +----------v-----------+   |  +---------------v----------------+   |
|  |   SimulationEngine   |   |  |   Optimizer Math Engine (NEW)  |   |
|  |   (discrete event,   |   |  |   pure TS functions (no class) |   |
|  |    plain TS class)   |   |  |   M/M/c/K + probe model        |   |
|  +----------+-----------+   |  +---------------+----------------+   |
|             |               |                  |                    |
|  +----------v-----------+   |  +---------------v----------------+   |
|  | SimulationLoop       |   |  |   StabilityChart (uPlot)       |   |
|  | PodCanvas (Canvas 2D)|   |  |   KneePoint overlay (Canvas)   |   |
|  | MetricsCharts (uPlot)|   |  |   RecommendationCard           |   |
|  +----------------------+   |  +--------------------------------+   |
+-----------------------------+---------------------------------------+
|            Shared: src/simulation/types.ts                         |
|   SimulationConfig, RequestProfile, ProbeConfig                    |
|   Imported read-only by optimizer -- never modified by it          |
+---------------------------------------------------------------------+
```

**Key principle for integration:** The optimizer is architecturally parallel to the simulator -- it has its own store, its own math engine, and its own UI components. The only coupling point is `src/simulation/types.ts`, which is imported read-only. No cross-tab state, no cross-tab function calls.

### Component Boundaries

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `App.tsx` | Tab state holder; conditional render of SimulatorView vs OptimizerView | MODIFY |
| `ControlPanel` | Simulator params + playback controls | UNCHANGED |
| `useSimulationStore` | Zustand store for simulator UI + engine refs | UNCHANGED |
| `SimulationEngine` | Discrete-event simulation runtime (Pod, Worker, EventQueue) | UNCHANGED |
| `SimulationLoop` + renderers | RAF bridge, Canvas draw, uPlot update | UNCHANGED |
| `src/simulation/types.ts` | Shared domain types: SimulationConfig, RequestProfile, ProbeConfig | UNCHANGED (imported read-only) |
| `OptimizerPanel` | Input form: traffic params, probe config, sweep bounds | NEW |
| `useOptimizerStore` | Zustand store: optimizer input, sweep results, selected recommendation | NEW |
| `queueing.ts` | Pure functions: Erlang C, M/M/c/K steady-state, blocking probability | NEW |
| `probeModel.ts` | Pure functions: probe-adjusted effective lambda and mu per pod | NEW |
| `sweep.ts` | Config space sweep over workers/pods/backlog, returns SweepPoint[] | NEW |
| `kneePoint.ts` | Kneedle algorithm: find elbow point on cost-vs-stability curve | NEW |
| `StabilityChart` | uPlot line chart: total workers (cost) vs P_block (stability) | NEW |
| `RecommendationCard` | Display recommended config at knee point with metrics summary | NEW |
| `OptimizerView` | Top-level optimizer tab layout: panel + chart + recommendation | NEW |

## Recommended Project Structure

```
src/
+-- simulation/              # Existing -- simulation engine (ALL UNCHANGED)
|   +-- types.ts             # Shared domain types: imported by optimizer too
|   +-- engine.ts
|   +-- pod.ts
|   +-- load-balancer.ts
|   +-- metrics.ts
|   +-- priority-queue.ts
|   +-- rng.ts
|   +-- CriticalEventTracker.ts
|   +-- *.test.ts
+-- optimizer/               # NEW -- math engine, isolated module
|   +-- types.ts             # OptimizerInput, OptimizerResult, SweepPoint
|   +-- queueing.ts          # M/M/c/K formulas as pure functions
|   +-- probeModel.ts        # Probe worker contention: effective lambda, mu
|   +-- sweep.ts             # Config space sweep
|   +-- kneePoint.ts         # Kneedle knee-point detection
|   +-- queueing.test.ts     # Unit tests against known M/M/c reference values
|   +-- probeModel.test.ts
|   +-- sweep.test.ts
+-- store/
|   +-- useSimulationStore.ts  # Existing -- unchanged
|   +-- useOptimizerStore.ts   # NEW -- optimizer input + result state
+-- components/              # Existing simulator UI -- ALL UNCHANGED
|   +-- ControlPanel.tsx
|   +-- ClusterParams.tsx
|   +-- TrafficParams.tsx
|   +-- ...
+-- optimizer-ui/            # NEW -- optimizer UI components
|   +-- OptimizerPanel.tsx   # Left sidebar: input form
|   +-- StabilityChart.tsx   # uPlot chart wired to sweep results
|   +-- RecommendationCard.tsx
|   +-- OptimizerView.tsx    # Composes panel + chart + recommendation
+-- visualization/           # Existing visualization layer -- ALL UNCHANGED
|   +-- PodCanvas.tsx
|   +-- MetricsCharts.tsx
|   +-- SimulationLoop.ts
|   +-- ...
+-- App.tsx                  # MODIFY: add tab state + TabBar + conditional render
+-- main.tsx                 # Unchanged
+-- index.css                # Unchanged
```

### Structure Rationale

- **`src/optimizer/`:** All math logic isolated, no React imports, fully testable without mounting components. Mirrors the `src/simulation/` pattern where the engine is framework-agnostic. This isolation also enables future Web Worker migration without changing the math code.
- **`src/optimizer-ui/`:** UI components for the optimizer tab, separate from `src/components/` which owns simulator UI. Clean boundary: no cross-imports between the two UI subtrees.
- **`src/simulation/types.ts` as shared types:** The existing types file defines `SimulationConfig`, `RequestProfile`, and `ProbeConfig`. The optimizer input overlaps these fields exactly. Import directly from the canonical source -- no duplication, no separate shared package needed at this scale (single-package SPA).
- **`src/store/useOptimizerStore.ts`:** Separate Zustand slice keeps optimizer state isolated from simulation. No shared mutable state between tabs; no cross-store subscriptions.

## Architectural Patterns

### Pattern 1: State-Driven Tab Navigation (No React Router)

**What:** A single `activeTab: 'simulator' | 'optimizer'` field in App-level `useState` controls which view renders. No routing library.

**When to use:** This project is a two-tab tool with no deep links, no bookmarkable optimizer states, and no browser back/forward within the optimizer. React Router's value-add (URL persistence, nested layouts, code splitting by route) is irrelevant here.

**Trade-offs:** No URL persistence of active tab. Acceptable: optimizer starts fresh each session and its inputs are transient parameters the user adjusts interactively.

**Static hosting compatibility:** Pure state-based switching works identically on GitHub Pages, S3, and local file serve. React Router `BrowserRouter` requires server-side URL rewriting which these hosts do not provide. `HashRouter` would work but adds ~50KB for no benefit.

**Example:**
```typescript
// App.tsx
type ActiveTab = 'simulator' | 'optimizer';

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');

  return (
    <div className="min-h-screen bg-[var(--bg-dominant)] flex flex-col">
      <TabBar activeTab={activeTab} onSelect={setActiveTab} />
      {activeTab === 'simulator' ? <SimulatorView /> : <OptimizerView />}
    </div>
  );
}
```

`SimulatorView` is a thin wrapper that renders the existing `ControlPanel` + canvas/charts layout. No changes to those components. `OptimizerView` renders the new optimizer components.

Zustand is NOT used for tab state. `useState` in App is sufficient -- tab selection is not needed by deeply nested components; it only controls top-level view switching.

### Pattern 2: Optimizer Engine as Pure Functions (Not a Class)

**What:** The optimizer math is a pipeline of pure functions, not a stateful class like `SimulationEngine`. Each function takes inputs and returns outputs with no side effects. The Zustand store calls functions synchronously on demand and stores results.

**When to use:** The math model has no state between calls. M/M/c/K formulas are stateless computations. A class would add lifecycle management (constructor, reset, teardown) for zero benefit. Pure functions are also trivially testable: no mocks, no setup, just inputs and outputs.

**Trade-offs:** Functions cannot be incrementally updated (each call recomputes from scratch). Given sweep completes in <10ms, this is not a concern.

**Example:**
```typescript
// optimizer/queueing.ts

// Erlang C: probability an arriving request waits (all workers busy, queue infinite)
export function erlangCWaitProb(lambda: number, mu: number, c: number): number { ... }

// M/M/c/K: blocking probability given finite queue capacity K = c + maxBacklog
// Uses log-space arithmetic to avoid factorial overflow for large c or K
export function mmckBlockingProb(
  lambda: number, mu: number, c: number, K: number
): number { ... }

// Expected queue length (Little's Law: L = lambda * W)
export function meanQueueLength(lambda: number, mu: number, c: number): number { ... }

// optimizer/probeModel.ts

// Effective arrival rate per pod including probe traffic
export function effectiveLambda(
  rps: number,
  podCount: number,
  livenessPeriodS: number,
  readinessPeriodS: number
): number {
  const probeRate = (1 / livenessPeriodS) + (1 / readinessPeriodS);
  return (rps / podCount) + probeRate;
}

// Effective service rate: harmonic mean weighted by request profile ratios
// Probe latency is probe timeout (worst case = full timeout when worker is blocked)
export function effectiveMu(
  profiles: RequestProfile[],
  probeTimeoutSeconds: number
): number { ... }
```

### Pattern 3: Config Sweep + Knee Point Detection

**What:** The optimizer sweeps a bounded parameter space computing blocking probability for each combination. Results feed a 2D curve (total worker cost vs P_block) from which a knee point is extracted using the Kneedle algorithm.

**When to use:** This is the optimizer's core value. Without a sweep, no curve. Without a knee point, no recommendation.

**Computational cost:** With ranges workers=1..20, pods=1..20, backlog=0..50, the sweep is 20,000 evaluations. Each evaluation is O(K) arithmetic where K = workers + backlog <= 70. Total: ~1.4M arithmetic operations. Completes in <10ms on a modern browser main thread. No Web Worker needed for this scale.

**Knee point algorithm (Kneedle):** Normalize the cost-vs-P_block curve to [0,1]x[0,1]. Find the index of maximum perpendicular distance from the diagonal line connecting first and last points. O(n) scan. Simple to implement and well-understood.

**Example:**
```typescript
// optimizer/sweep.ts
export interface SweepPoint {
  workersPerPod: number;
  podCount: number;
  maxBacklog: number;
  pBlock: number;           // M/M/c/K blocking probability
  totalWorkers: number;     // workersPerPod * podCount (cost proxy)
}

export function sweepConfigs(input: OptimizerInput): SweepPoint[] {
  const results: SweepPoint[] = [];
  for (let w = input.workerRange.min; w <= input.workerRange.max; w++) {
    for (let p = input.podRange.min; p <= input.podRange.max; p++) {
      for (let b = input.backlogRange.min; b <= input.backlogRange.max; b++) {
        const lambda = effectiveLambda(input.rps, p, ...);
        const mu = effectiveMu(input.profiles, ...);
        const pBlock = mmckBlockingProb(lambda, mu, w, w + b);
        results.push({ workersPerPod: w, podCount: p, maxBacklog: b, pBlock, totalWorkers: w * p });
      }
    }
  }
  return results;
}

// optimizer/kneePoint.ts
export function findKneePoint(curve: { x: number; y: number }[]): number {
  // Kneedle: normalize, find index of max distance from diagonal
  // Returns index into curve array
}
```

### Pattern 4: uPlot for Stability Chart (Reuse Existing Library)

**What:** The cost-vs-stability graph uses uPlot, already installed in the project. One `x` series (totalWorkers = workersPerPod * podCount) and one `y` series (P_block). The knee point is overlaid as a Canvas annotation using uPlot's `draw` hook.

**When to use:** uPlot is already a project dependency (~545KB unpacked). The stability chart is a simple 2D line. No additional library needed.

**Knee point annotation:** uPlot's `draw` hook provides access to the underlying canvas context and the `u.valToPos()` coordinate transform. Drawing a vertical line + dot at the knee point is ~20 lines.

**Anti-pattern avoided:** Do not introduce Recharts or Chart.js for this one chart. The project has an explicit bundle-size constraint and uPlot is already the standard.

## Data Flow

### Optimizer Computation Flow

```
User fills OptimizerPanel
         |
         v
useOptimizerStore.setInput(input)  -- stores input, clears previous result
         |
User clicks "Calculate" (or on input change if auto-run)
         |
         v
useOptimizerStore.runOptimizer()
  calls: sweepConfigs(input)          -- src/optimizer/sweep.ts
    each point calls:
      effectiveLambda(...)            -- src/optimizer/probeModel.ts
      effectiveMu(...)                -- src/optimizer/probeModel.ts
      mmckBlockingProb(...)           -- src/optimizer/queueing.ts
  returns: SweepPoint[]
  calls: buildCurve(sweepPoints)      -- aggregate by totalWorkers
  calls: findKneePoint(curve)         -- src/optimizer/kneePoint.ts
  stores: { sweepPoints, curve, kneeIndex, recommendation }
         |
         v
StabilityChart re-renders (subscribed to store)
RecommendationCard re-renders (subscribed to store)
```

### Probe Contention in the Math Model

The critical domain constraint: probes consume workers like regular requests. The math model accounts for this by treating probes as additional arrival traffic:

```
Per-pod effective arrival rate:
  lambda_eff = (rps / podCount) + (1/livenessPeriod_s) + (1/readinessPeriod_s)

Per-pod server count (M/M/c/K 'c'):
  c = workersPerPod

System capacity (M/M/c/K 'K'):
  K = workersPerPod + maxBacklog

Effective service rate (mu):
  Weighted harmonic mean of request profile latencies
  Probe contribution: each probe arrival adds probe_timeout weight at worst case
```

This mapping translates directly from `SimulationConfig` fields to queueing theory parameters. No new concepts needed -- the optimizer speaks the same domain language as the simulator.

### Shared Types: Import Graph

```
src/simulation/types.ts  (canonical domain types -- unchanged)
   |
   +-- imported by src/optimizer/types.ts
   |       defines: OptimizerInput (uses RequestProfile, ProbeConfig from sim/types)
   |                OptimizerResult, SweepPoint
   |
   +-- imported by src/optimizer/probeModel.ts
   |       uses: RequestProfile for latency/ratio
   |
   +-- imported by src/store/useOptimizerStore.ts
           uses: OptimizerInput, OptimizerResult
```

`src/simulation/types.ts` is the single source of truth for domain vocabulary. It is never modified by the optimizer -- treated as a library import.

## Integration Points

### New vs. Modified Components

| Component | Status | Change Description |
|-----------|--------|--------------------|
| `src/App.tsx` | MODIFY | Add `activeTab` useState + `<TabBar>` + conditional render of `<OptimizerView />` |
| `src/index.css` | POSSIBLY MODIFY | Tab bar styles not covered by Tailwind utilities (likely minor) |
| `src/simulation/types.ts` | UNCHANGED | Read-only import by optimizer |
| `src/store/useSimulationStore.ts` | UNCHANGED | Simulation store isolation preserved |
| `src/simulation/*.ts` | UNCHANGED | Engine untouched |
| `src/visualization/*.ts` | UNCHANGED | Visualization layer untouched |
| `src/components/*.tsx` | UNCHANGED | Simulator UI components untouched |

### New Files

| File | Purpose |
|------|---------|
| `src/optimizer/types.ts` | OptimizerInput, OptimizerResult, SweepPoint types |
| `src/optimizer/queueing.ts` | Erlang C, M/M/c/K pure functions |
| `src/optimizer/probeModel.ts` | Probe-adjusted effective lambda and mu |
| `src/optimizer/sweep.ts` | Config space sweep over workers/pods/backlog |
| `src/optimizer/kneePoint.ts` | Kneedle knee-point detection on 2D curve |
| `src/optimizer/queueing.test.ts` | Formula tests against known M/M/c reference values |
| `src/optimizer/probeModel.test.ts` | Probe model unit tests |
| `src/optimizer/sweep.test.ts` | Sweep output shape + knee point tests |
| `src/store/useOptimizerStore.ts` | Zustand store for optimizer state |
| `src/optimizer-ui/OptimizerPanel.tsx` | Input form sidebar (traffic params, probe config, sweep bounds) |
| `src/optimizer-ui/StabilityChart.tsx` | uPlot cost-vs-stability chart with knee-point annotation |
| `src/optimizer-ui/RecommendationCard.tsx` | Recommended config display with key metrics |
| `src/optimizer-ui/OptimizerView.tsx` | Top-level optimizer tab layout |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `optimizer/` <-> `simulation/` | Import of types only (read-only) | No runtime coupling; SimulationEngine never called by optimizer |
| `optimizer/` <-> `optimizer-ui/` | Function calls via Zustand store actions | Math engine has zero React/DOM dependencies |
| `SimulatorView` <-> `OptimizerView` | None at runtime | Tab switch re-renders App only; both views independently stateful |
| `useSimulationStore` <-> `useOptimizerStore` | None | Separate store slices, no cross-store subscriptions |

## Suggested Build Order

Ordered by dependency: each phase's prerequisites are satisfied by the prior phase.

**Phase 1 -- Queueing Math Engine** (pure TypeScript, no UI dependencies)
- `src/optimizer/types.ts`
- `src/optimizer/queueing.ts` -- M/M/c/K formulas with log-space arithmetic
- `src/optimizer/probeModel.ts` -- probe-adjusted lambda/mu
- `src/optimizer/sweep.ts` -- config sweep
- `src/optimizer/kneePoint.ts` -- knee point detection
- All `*.test.ts` -- verify formulas against hand-calculated M/M/c reference values

Verify: `vitest run` passes. P_block for known inputs matches textbook M/M/c/K values.

**Phase 2 -- Optimizer Store** (depends on Phase 1 types and functions)
- `src/store/useOptimizerStore.ts`
- Verify: calling `runOptimizer()` with valid input produces correct SweepPoint[] shape and populates recommendation.

**Phase 3 -- Tab Navigation** (modifies App.tsx, no optimizer UI dependency)
- Add `activeTab` state and `<TabBar>` component to `App.tsx`
- Render stub `<div>Optimizer coming soon</div>` for optimizer tab

Verify: tab switching works, simulator tab still functions identically.

**Phase 4 -- Optimizer UI** (depends on Phases 1, 2, 3)
- `src/optimizer-ui/OptimizerPanel.tsx`
- `src/optimizer-ui/StabilityChart.tsx` -- uPlot wired to store results
- `src/optimizer-ui/RecommendationCard.tsx`
- `src/optimizer-ui/OptimizerView.tsx`
- Wire `OptimizerView` into `App.tsx`

Verify: entering traffic params triggers sweep, chart renders curve, recommendation card shows knee-point config.

## Anti-Patterns

### Anti-Pattern 1: Adding React Router for Two Tabs

**What people do:** Install `react-router-dom` to get URL-based tab routing.

**Why it's wrong:** The project deploys as a static SPA (GitHub Pages / S3). `BrowserRouter` requires server URL rewriting these hosts do not provide. `HashRouter` works but adds ~50KB for zero functional gain. The optimizer has no deep links and no bookmarkable state.

**Do this instead:** `useState<'simulator' | 'optimizer'>` in `App.tsx`. Switching tabs is UI state, not routing.

### Anti-Pattern 2: Duplicating SimulationConfig Types for Optimizer Input

**What people do:** Define a separate `OptimizerTrafficConfig` that copies `rps`, `requestProfiles`, `livenessProbe`, `readinessProbe` fields.

**Why it's wrong:** `src/simulation/types.ts` already defines these types canonically. Duplicating creates divergence risk: if `ProbeConfig` gains a field, only one copy gets updated.

**Do this instead:** `OptimizerInput` imports `RequestProfile` and `ProbeConfig` directly from `../simulation/types`. Only the new sweep-bound fields (workerRange, podRange, backlogRange) are defined in `src/optimizer/types.ts`.

### Anti-Pattern 3: Running the Sweep Inside a React Component

**What people do:** Compute the sweep in a `useMemo` or `useEffect` inside `StabilityChart.tsx`.

**Why it's wrong:** Embeds math logic in render lifecycle, making it untestable without component mounting. Creates implicit dependencies on React re-render timing.

**Do this instead:** Zustand store action `runOptimizer()` calls `sweepConfigs()` synchronously and stores results. Components are display-only -- they subscribe to results, never compute them.

### Anti-Pattern 4: A New Chart Library for the Stability Graph

**What people do:** Reach for Recharts or Chart.js because the optimizer chart is "different."

**Why it's wrong:** uPlot is already installed and has working patterns in the project. Adding a second library doubles chart-related bundle size. The stability chart is a simple 2D line with one annotation -- uPlot handles this with its `draw` hook.

**Do this instead:** Use uPlot for the stability chart following the same `uplot-react` wrapper pattern used in `MetricsCharts.tsx`. Use the `draw` hook for the knee-point Canvas annotation.

### Anti-Pattern 5: Merging Optimizer State into useSimulationStore

**What people do:** Add `optimizerInput`, `optimizerResult` to `useSimulationStore.ts` for convenience.

**Why it's wrong:** The simulation store holds live engine refs and playback state that changes at 60fps. Optimizer state changes only on explicit user action. Coupling them causes unrelated re-renders and violates single-responsibility.

**Do this instead:** Separate `useOptimizerStore.ts`. Independent features get independent stores.

## Scaling Considerations

This is a browser-only single-user tool. "Scaling" means supporting wider sweep spaces and more complex math models.

| Scenario | Approach |
|----------|----------|
| Current sweep (20x20x50 = 20K evals) | Synchronous main thread, <10ms |
| Wider sweep (50x50x100 = 250K evals) | Still feasible synchronous (~50ms). If UI jank occurs, yield via `setTimeout(..., 0)` between sweep chunks |
| Monte Carlo extension or very wide sweep | Move `sweepConfigs()` to a Web Worker. Pure-function architecture makes this drop-in: serialize OptimizerInput, post to Worker, receive SweepPoint[] back. No architectural refactor needed |

The pure-function design of the optimizer engine means Web Worker migration is a future option that requires changing only the call site in the store -- not the math code itself.

## Sources

- [M/M/c queue -- Wikipedia](https://en.wikipedia.org/wiki/M/M/c_queue): M/M/c/K steady-state probability formulas (HIGH confidence)
- [M/M/s/K Queueing Model -- Real Statistics](https://real-statistics.com/probability-functions/queueing-theory/m-m-s-k-queueing-model/): Finite-queue blocking probability derivation (HIGH confidence)
- [Erlang C Formula Made Simple -- Call Centre Helper](https://www.callcentrehelper.com/erlang-c-formula-example-121281.htm): Erlang C P(wait) formula (HIGH confidence)
- [Gunicorn Design](https://gunicorn.org/design/): Sync worker pre-fork model confirming one-request-per-worker behavior (HIGH confidence)
- [uPlot GitHub Issue #107](https://github.com/leeoniya/uPlot/issues/107): uPlot custom draw hook for annotations (MEDIUM confidence -- issue-level documentation)
- [React Router v7 Hash Routing Discussion](https://github.com/remix-run/react-router/discussions/13057): Confirms HashRouter still viable in v7 SPA mode (MEDIUM confidence)
- [React State Management 2025 -- developerway.com](https://www.developerway.com/posts/react-state-management-2025): useState for isolated tab state vs Zustand for shared state (MEDIUM confidence)

---
*Architecture research for: Statistical Optimizer integration into slow_request_simulator SPA*
*Researched: 2026-04-11*
