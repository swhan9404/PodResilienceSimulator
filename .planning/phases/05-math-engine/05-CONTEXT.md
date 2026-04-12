# Phase 5: Math Engine - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

M/M/c/K queuing model with probe correction, parameter sweep, and knee point detection. Pure TypeScript math library — no UI, no React components. Produces functions that Phase 7 (Optimizer UI) will consume.

</domain>

<decisions>
## Implementation Decisions

### Probe Correction Model
- **D-01:** Use effective capacity reduction: `c_eff = c - (probe_rate × probe_duration × num_probe_types)`. Subtract probe duty cycle from available workers per pod.
- **D-02:** Hardcode probe processing time to 1ms, matching the simulator's fixed probe duration.
- **D-03:** Model worker occupancy only — do not attempt to model backlog displacement by probes. Keep the correction simple for v1.1.

### Knee Curve & Stability Metric
- **D-04:** Knee detection curve axes: X = total workers (podCount × workersPerPod, cost proxy), Y = blocking probability (P_block).
- **D-05:** Fallback when no knee exists: percentile threshold — return smallest configuration where P_block < 1% (0.01).
- **D-06:** Default P_block threshold for fallback: 1% (0.01), matching industry-standard SLA targets.

### Sweep Parameter Design
- **D-07:** Sweep ranges auto-derived from input RPS and request profile. No hardcoded ranges — compute sensible min/max from traffic parameters.
- **D-08:** Uniform step size (+1) for both workersPerPod and podCount dimensions. Auto-ranges keep grids small enough (<500 points) for instant computation.
- **D-09:** Fixed maxBacklog — sweep only workersPerPod × podCount as MATH-03 specifies. maxBacklog stays at input value (K in M/M/c/K).

### Engine API Surface
- **D-10:** Standalone pure functions — export `computeMMcK()`, `computeSweep()`, `findKneePoint()` as independent functions. No class, no state.
- **D-11:** Own input type (`OptimizerInput`) with only the fields the math needs. Decoupled from `SimulationConfig`. Phase 7 maps between them.
- **D-12:** Files live in `src/optimizer/` — new top-level directory alongside `src/simulation/` and `src/visualization/`.

### Claude's Discretion
- Internal numeric precision choices (e.g., convergence thresholds for iterative Erlang C)
- Kneedle sensitivity parameter tuning
- Auto-range multiplier for sweep bounds derivation
- Internal function decomposition within `src/optimizer/`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Codebase
- `src/simulation/types.ts` — SimulationConfig, ProbeConfig, RequestProfile types that the optimizer input type mirrors
- `src/simulation/engine.ts` — Probe handling logic (lines 218-268) showing how probes consume workers in the simulator
- `src/store/useSimulationStore.ts` — Default config values (podCount: 270, workersPerPod: 4, rps: 2350) useful for testing

### Requirements
- `.planning/REQUIREMENTS.md` §Math Engine — MATH-01 through MATH-04 acceptance criteria
- `.planning/ROADMAP.md` §Phase 5 — Success criteria (especially #5: Erlang C at c=20, rho=0.99 with no NaN/Infinity)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RequestProfile` type (name, latencyMs, ratio, color) — optimizer needs the same fields minus `color`
- `ProbeConfig` type (periodSeconds, timeoutSeconds, failureThreshold, successThreshold) — needed for probe rate calculation
- `createRng` / `selectProfile` in `src/simulation/rng.ts` — not directly needed (math is deterministic) but shows how request profiles are weighted

### Established Patterns
- Pure TypeScript classes/functions in `src/simulation/` — no React dependencies in engine code
- Comprehensive test files alongside source (e.g., `engine.test.ts`, `pod.test.ts`) — math engine should follow same pattern
- Integer milliseconds for all time values (per D-01 in simulation types)

### Integration Points
- Phase 7 will call optimizer functions from a React component, passing user input → optimizer → display results
- Phase 6 tab navigation will mount both simulator and optimizer views — no direct code dependency between phases 5 and 6

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for queuing theory implementation.

Key constraints from STATE.md:
- Iterative Erlang C to avoid factorial overflow at c >= 18 (already decided)
- ~200 LOC target for queuing formulas
- No new npm dependencies

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-math-engine*
*Context gathered: 2026-04-12*
