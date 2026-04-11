# Project Research Summary

**Project:** Slow Request Simulator — v1.1 Statistical Optimizer
**Domain:** Queuing theory capacity planning optimizer added to an existing browser-based discrete event simulator
**Researched:** 2026-04-11
**Confidence:** HIGH

## Executive Summary

This milestone adds a mathematical optimizer tab to an existing React 19 + TypeScript + Vite SPA (v1.0, 137 tests, ~4,967 LOC). The optimizer answers the inverse question from the simulator: instead of "watch how these settings fail," it answers "given this traffic, what settings prevent failure?" The core engine is pure queuing theory math — M/M/c/K with probe occupancy correction — implemented as zero-dependency TypeScript functions. No new npm packages are required. The computation is synchronous, completes in under 10ms for any realistic parameter range, and plugs into the existing Zustand + uPlot stack without architectural changes to the simulator side.

The recommended approach is to build the optimizer as a fully isolated parallel track alongside the simulator. The optimizer gets its own directory (`src/optimizer/`), its own Zustand store (`useOptimizerStore`), and its own UI subtree (`src/optimizer-ui/`). The only coupling point is `src/simulation/types.ts`, imported read-only. This mirrors the existing simulator's clean separation between engine and UI. Tab navigation is handled with a single `activeTab` useState in App.tsx — no React Router needed on a static-hosted SPA.

The dominant risks are mathematical, not architectural: Erlang C overflows silently at `workersPerPod >= 18` unless iterative computation is used; the M/M/c/K steady-state model cannot predict cascade timing (only the simulator can); and the standard μ formula severely underestimates failure risk when slow requests (bimodal latency distribution) dominate. All three must be addressed in the math engine before any UI is built. A secondary risk is tab-switching breaking the simulator's RAF loop — the correct fix is CSS visibility toggling rather than conditional unmounting.

## Key Findings

### Recommended Stack

The v1.0 stack (React 19, TypeScript ~5.7, Vite 8, Zustand 5, uPlot 1.6.32, Canvas 2D, Tailwind CSS 4) requires zero new dependencies for the optimizer. All queuing formulas — Erlang C, M/M/c/K steady-state, Kneedle knee detection — are implementable in ~200 lines of plain TypeScript using only `Math.*`. The uPlot instance already installed handles the cost-vs-stability chart including dual y-axes and Canvas-based knee point annotation via its `hooks.draw` API. The decision not to add mathjs (9.4MB) or jstat (706KB) is firm: neither provides queuing-specific functions; they would only wrap formulas you must write anyway.

**Core technologies (new code modules, no new npm installs):**
- `src/optimizer/queueing.ts`: M/M/c/K formulas — iterative Erlang C prevents overflow, birth-death recursion for steady-state
- `src/optimizer/probeModel.ts`: Probe-adjusted effective lambda and mu — the domain-specific correction that differentiates this from a generic M/M/c calculator
- `src/optimizer/sweep.ts`: Config space sweep over (workers × pods × backlog), returns `SweepPoint[]`
- `src/optimizer/kneePoint.ts`: Kneedle algorithm (~40 lines) — find elbow of cost-vs-stability curve
- `src/store/useOptimizerStore.ts`: Separate Zustand slice, mirrors existing `useSimulationStore` pattern
- uPlot (existing): Reused for stability chart; `hooks.draw` callback for knee-point vertical line annotation

### Expected Features

**Must have (table stakes — P1 for this milestone):**
- M/M/c/K calculation engine with probe occupancy correction — every M/M/c calculator provides utilization/blocking; this tool must too, but with Kubernetes probe awareness
- Traffic inputs form (RPS, request profiles) — map directly to existing `SimulationConfig` types
- 1D sweep chart: workers/pod vs. utilization with color zones (green/yellow/red)
- Knee point annotation on the sweep chart — the central UX differentiator; no generic calculator does this
- Recommended configuration callout with rationale text ("Use 6 workers/pod because...")
- Pre-fill from simulator config button — one click for the natural workflow

**Should have (competitive — P2, add after validation):**
- 2D heatmap (podCount × workersPerPod) — most powerful visualization; highest implementation cost; defer post-MVP
- Sensitivity analysis: recompute at ±20% slow ratio, show delta columns
- Side-by-side comparison: optimizer recommendation vs. current simulator config

**Defer (v2+):**
- maxBacklog optimization (second-order concern)
- Monte Carlo overlay comparing M/M/c/K mean estimates to simulator P95/P99
- Multiple traffic scenario comparison

### Architecture Approach

The optimizer is architecturally parallel, not nested within, the simulator. It has its own store, its own math engine, and its own UI directory. The single shared coupling is `src/simulation/types.ts` (read-only import of `SimulationConfig`, `RequestProfile`, `ProbeConfig`). Tab navigation lives in `App.tsx` as `useState<'simulator' | 'optimizer'>` — no React Router, no hash routing. The simulator and optimizer views must never share Zustand state at runtime; the "pre-fill from simulator" action is an explicit one-way copy on user click, not a live binding.

**Major components:**
1. `src/optimizer/` — Pure math engine: `types.ts`, `queueing.ts`, `probeModel.ts`, `sweep.ts`, `kneePoint.ts` + unit tests. Zero React imports. Directly testable.
2. `src/store/useOptimizerStore.ts` — Zustand store with `runOptimizer()` action that calls math engine synchronously and stores `SweepPoint[]` + knee index + recommendation.
3. `src/optimizer-ui/` — React UI components: `OptimizerPanel.tsx` (inputs), `StabilityChart.tsx` (uPlot), `RecommendationCard.tsx`, `OptimizerView.tsx` (layout). Display-only; no math here.
4. `App.tsx` (modified) — Adds `activeTab` state, `<TabBar>`, and conditional rendering. Simulator component kept mounted via CSS visibility, not unmounted.

### Critical Pitfalls

1. **Probe occupancy ignored in M/M/c model** — Standard M/M/c treats all `c` workers as available for requests. Probes consume workers too. Fix: treat probes as additional Poisson arrival traffic (`λ_probe = 2/periodSeconds`) in the effective lambda calculation. This is non-negotiable for this domain and must be baked into Phase 1.

2. **Erlang C numerical overflow at workersPerPod >= 18** — `20!` exceeds `Number.MAX_SAFE_INTEGER`. Direct textbook formula silently produces NaN or wrong values. Fix: use the iterative recurrence `term *= rho/k` that builds `A^k/k!` incrementally. Verify with unit tests at c=20, ρ=0.99.

3. **Bimodal latency (normal + slow requests) collapsed to single μ** — Weighted-average service rate makes 50% slow at 10s look similar to 5% slow at 10s. The slow-request tail is exactly the failure mechanism. Fix: compute a separate "slow-request-only ρ" metric in addition to Erlang C ρ. Surface both in the UI.

4. **Tab switching unmounts simulator, kills RAF loop** — `{activeTab === 'simulator' && <Simulator />}` causes remount on return, losing engine state. Fix: use CSS `display: none` visibility toggle (keepMounted pattern) — the simulator component stays in the DOM regardless of active tab.

5. **Knee detection on monotone or near-flat curves** — Kneedle always returns something even when no knee exists. Fix: check that second derivative changes sign before reporting a knee; fall back to percentile heuristic (first point where adding one worker reduces P_block by less than threshold X%) if curve is monotone.

## Implications for Roadmap

Based on combined research, a 4-phase build order is strongly indicated by dependency requirements. Each phase is independently verifiable before the next begins.

### Phase 1: Queueing Math Engine

**Rationale:** All downstream components depend on correct math. Building and verifying formulas first, with no UI dependency, ensures the foundation is sound. Math functions are pure TypeScript — testable in isolation with Vitest. Critical math pitfalls (Erlang C overflow, probe occupancy, bimodal latency) must be addressed here before they propagate to the UI layer.

**Delivers:** `src/optimizer/` directory with all pure math functions (`queueing.ts`, `probeModel.ts`, `sweep.ts`, `kneePoint.ts`, `types.ts`) and full unit test coverage.

**Addresses:** M/M/c/K engine (P1 must-have), probe occupancy correction (P1), blocking probability (P1)

**Avoids:** Pitfall 1 (probe occupancy), Pitfall 3 (Erlang C overflow), Pitfall 5 (bad knee detection), Pitfall 7 (bimodal latency to single μ)

**Verification:** `vitest run` passes. P_block for known inputs matches textbook M/M/c/K values. Boundary tests at c=20, ρ=0.99 produce no NaN/Infinity. Monotone-curve knee detection falls back gracefully. Config with 20% slow at 10s produces higher risk score than 5% slow at 10s.

### Phase 2: Optimizer Store

**Rationale:** The Zustand store bridges math engine and UI. Building it after Phase 1 but before UI components ensures `runOptimizer()` is verified as a standalone action before any component subscribes to it. Keeping the store as its own phase also surfaces isolation bugs early (e.g., accidental coupling to `useSimulationStore`).

**Delivers:** `src/store/useOptimizerStore.ts` with input state, sweep result state, and `runOptimizer()` action.

**Uses:** Phase 1 math functions, existing Zustand 5 pattern from `useSimulationStore`

**Avoids:** Pitfall 8 (optimizer state coupling to simulator state)

**Verification:** Calling `runOptimizer()` with valid input produces correct `SweepPoint[]` shape and recommendation. Simulator store state is unaffected by optimizer actions.

### Phase 3: Tab Navigation

**Rationale:** Tab navigation is a pure `App.tsx` modification with no dependency on optimizer math or UI components. Building it third (before optimizer UI) allows the simulator to be verified as still functional under the new tab architecture before optimizer components are added. The CSS keepMounted approach must be confirmed against the existing RAF loop and Canvas ref implementation.

**Delivers:** Working tab bar (Simulator / Optimizer), CSS visibility toggle that keeps simulator mounted, stub `<OptimizerView>` placeholder.

**Avoids:** Pitfall 10 (tab switching breaks simulation state)

**Verification:** Start simulation, switch to Optimizer tab, switch back — simulation still running, RAF loop intact.

### Phase 4: Optimizer UI

**Rationale:** All prerequisites satisfied by Phases 1-3. UI components are display-only consumers of store state — no math embedded in components. Building last means any UI bugs are isolated to the UI layer and do not risk destabilizing the math engine.

**Delivers:** `src/optimizer-ui/` with `OptimizerPanel.tsx`, `StabilityChart.tsx` (uPlot with knee annotation), `RecommendationCard.tsx`, `OptimizerView.tsx` wired into App.

**Implements:** Traffic inputs form, 1D sweep chart with color zones, knee annotation, recommendation callout, pre-fill from simulator button

**Avoids:** Pitfall 2 (steady-state vs. transient framing — UI copy), Pitfall 4 (optimizer/simulator apparent contradiction — UI framing), Pitfall 9 (prescriptive recommendation without safety margin)

**Verification:** Enter traffic params → chart renders curve → knee annotated → recommendation card shows knee-point config with ρ and safety margin. ρ=0.9 config shows warning, not green checkmark. Changing optimizer inputs leaves simulator config unchanged.

### Phase Ordering Rationale

- Math before store before UI: the classic layered dependency order; each layer is fully testable before the next is built
- Tab navigation as a separate phase before optimizer UI: isolates the "does tab switching break the simulator?" risk in a phase with minimal new code, making it easy to catch and fix before UI complexity is added
- Pre-fill button built in Phase 4: reads `useSimulationStore` read-only; building this last avoids any temptation to accidentally couple stores during earlier phases
- 2D heatmap and sensitivity analysis intentionally deferred: the research is unambiguous that these are P2 features belonging in a follow-up phase or PR

### Research Flags

Phases with standard, well-documented patterns (no deeper research needed):
- **Phase 2 (Zustand store):** Direct extension of the existing `useSimulationStore` pattern. Zustand 5 slice creation is standard.
- **Phase 3 (Tab navigation):** `useState` + CSS visibility toggle is boilerplate. Existing `PodCanvas.tsx` and `SimulationLoop.ts` will confirm the right keepMounted strategy.
- **Phase 4 (uPlot chart):** The dual y-axis and `hooks.draw` annotation patterns are documented in uPlot's README and issue tracker. Existing `MetricsCharts.tsx` provides a working reference implementation.

Phases that may benefit from targeted research during planning:
- **Phase 1 (Math engine):** Probe occupancy modeling is a domain-specific approximation (treating probes as Poisson traffic). If Phase 4 comparison between optimizer and simulator shows persistent divergence at high utilization, deeper research into M/G/c models or simulation-calibrated probe correction may be warranted.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies — extends verified v1.0 stack. uPlot multi-axis and `hooks.draw` patterns confirmed in official docs and uPlot GitHub issues. |
| Features | MEDIUM-HIGH | Core queuing formulas are textbook-established (HIGH). UI patterns synthesized from existing calculator analysis and SRE tooling research (MEDIUM). Bimodal latency handling is a domain-specific approximation without peer-reviewed validation in the Kubernetes context. |
| Architecture | HIGH | Component boundaries are clean and consistent with v1.0 patterns. Pure-function engine design is architecturally conservative. All new components are net-new (no refactoring of existing working code). |
| Pitfalls | HIGH for math pitfalls (Erlang C overflow, probe model, bimodal latency). MEDIUM for UI/integration pitfalls (inference from established React patterns). |

**Overall confidence:** HIGH

### Gaps to Address

- **Probe occupancy approximation accuracy:** The model treats probes as additional Poisson traffic (`λ_probe = 1/periodSeconds`). This is a first-order approximation. Plan to compare optimizer utilization predictions against simulator steady-state measurements during Phase 1 verification and document the observed delta for the UI disclaimer.

- **Kneedle behavior on small parameter ranges:** At pod ranges of 1-5, the sweep produces fewer than 10 data points — below Kneedle's reliable threshold. The percentile-threshold fallback must be implemented alongside Kneedle from the start of Phase 1, not retrofitted.

- **Simulator keepMounted implementation:** The v1.0 codebase was not designed for tab switching. The exact mechanism (CSS `display: none` wrapper, `visibility: hidden`, or a `keepMounted` prop) needs to be confirmed against the existing RAF loop and Canvas ref initialization in `SimulationLoop.ts` and `PodCanvas.tsx`. This should be the first thing verified in Phase 3.

## Sources

### Primary (HIGH confidence)
- [M/M/c queue — Wikipedia](https://en.wikipedia.org/wiki/M/M/c_queue) — Erlang C formula, M/M/c/K steady-state, birth-death recursion
- [M/M/s/K Queueing Model — Real Statistics](https://real-statistics.com/probability-functions/queueing-theory/m-m-s-k-queueing-model/) — Finite-queue blocking probability derivation
- [Erlang C Formula — Call Centre Helper](https://www.callcentrehelper.com/erlang-c-formula-example-121281.htm) — Numerically stable iterative form confirmed
- [uPlot GitHub README](https://github.com/leeoniya/uPlot/blob/master/docs/README.md) — Multi-scale/multi-axis API, hooks.draw pattern
- [Gunicorn Design](https://gunicorn.org/design/) — Sync worker pre-fork model, one-request-per-worker behavior
- [Simulation Modeling and Arena — Queuing Formulas](https://rossetti.github.io/RossettiArenaBook/app-qt-sec-formulas.html) — M/M/c/K textbook reference

### Secondary (MEDIUM confidence)
- [Finding a Kneedle in a Haystack (Satopaa et al., 2011)](https://raghavan.usc.edu/papers/kneedle-simplex11.pdf) — Kneedle algorithm core; TypeScript port confirmed feasible at ~40 lines
- [Kneeliverse paper (ScienceDirect 2025)](https://www.sciencedirect.com/science/article/pii/S2352711025001281) — Confirms no JS/TS knee detection library exists; manual port required
- [uPlot GitHub Issue #107](https://github.com/leeoniya/uPlot/issues/107) — Custom draw hook for annotations (issue-level documentation)
- [Half-latency rule for knee (ResearchGate)](https://www.researchgate.net/publication/283046699_Half-Latency_Rule_for_Finding_the_Knee_of_the_Latency_Curve) — 71.5% utilization as operational knee threshold
- [Gunicorn issue #2467](https://github.com/benoitc/gunicorn/issues/2467) — Probe worker occupancy problem in Kubernetes context

### Tertiary (LOW confidence)
- [MOSIMTEC — simulation vs optimization](https://mosimtec.com/simulation-vs-optimization/) — Framing optimizer as screener, simulator as validator; community consensus
- [React State Management 2025 — developerway.com](https://www.developerway.com/posts/react-state-management-2025) — useState for isolated tab state pattern

---
*Research completed: 2026-04-11*
*Ready for roadmap: yes*
