---
phase: 05-math-engine
plan: 02
subsystem: optimizer
tags: [queuing-theory, math-engine, sweep, kneedle, knee-detection]
dependency_graph:
  requires:
    - phase: 05-01
      provides: [computeMMcK, computeEffectiveWorkers, OptimizerInput, MMcKResult, SweepPoint, KneeResult, ProbeParams]
  provides:
    - computeSweep function with auto-range derivation and 500-point grid cap
    - findKneePoint function with Kneedle algorithm and threshold fallback
    - Public barrel index re-exporting all optimizer functions and types
  affects: [06-optimizer-ui, 07-integration]
tech_stack:
  added: []
  patterns: [auto-range-derivation, kneedle-difference-curve, threshold-fallback, barrel-reexport]
key_files:
  created:
    - src/optimizer/sweep.ts
    - src/optimizer/sweep.test.ts
    - src/optimizer/kneedle.ts
    - src/optimizer/kneedle.test.ts
    - src/optimizer/index.ts
  modified: []
key_decisions:
  - "Auto-range uses 0.5x-2.5x of minimum stability workers (minWorkers = ceil(rps/mu))"
  - "Grid clamping uses sqrt(500) per-axis when auto-derived ranges exceed 500 total points"
  - "Kneedle sensitivity defaults to 1.0 per Satopaa et al. paper recommendation"
  - "Fallback threshold 0.01 (1% P_block) per D-06 industry-standard SLA target"
patterns-established:
  - "Auto-range derivation: derive sweep bounds from traffic parameters, not hardcoded"
  - "Kneedle difference curve: normalize, flip for decreasing data, find local max"
  - "Threshold fallback: always compute fallback alongside Kneedle for robustness"
requirements-completed: [MATH-03, MATH-04]
metrics:
  duration: 156s
  completed: "2026-04-12T03:00:26Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 17
  lines_added: 364
---

# Phase 5 Plan 2: Parameter Sweep and Knee Detection Summary

**computeSweep auto-derives workersPerPod x podCount grid from RPS/latency (capped at 500 points), findKneePoint detects cost-efficiency inflection via Kneedle algorithm with 1% P_block threshold fallback.**

## Performance

- **Duration:** 156s
- **Started:** 2026-04-12T02:57:50Z
- **Completed:** 2026-04-12T03:00:26Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- computeSweep generates sorted parameter grid with auto-range derivation from RPS and avg latency
- findKneePoint identifies knee on concave P_block curves using Kneedle algorithm (Satopaa 2011)
- Threshold fallback returns smallest config where P_block < 0.01 when no knee exists
- Barrel index provides single import point for all optimizer functions and types
- 28 total optimizer tests pass (11 queuing + 8 sweep + 9 kneedle)

## Task Commits

Each task was committed atomically:

1. **Task 1: computeSweep with auto-range derivation (TDD)**
   - `f236a65` (test): add failing tests for computeSweep auto-range derivation
   - `d740bb9` (feat): implement computeSweep with auto-range derivation

2. **Task 2: findKneePoint with fallback + barrel index (TDD)**
   - `e2a7e90` (test): add failing tests for findKneePoint knee detection
   - `7516385` (feat): implement findKneePoint and barrel index

## Files Created/Modified
- `src/optimizer/sweep.ts` - computeSweep with auto-range derivation and grid clamping
- `src/optimizer/sweep.test.ts` - 8 test cases for grid generation, sorting, caps, edge cases
- `src/optimizer/kneedle.ts` - findKneePoint with Kneedle algorithm and threshold fallback
- `src/optimizer/kneedle.test.ts` - 9 test cases for knee detection, flat/linear, fallback
- `src/optimizer/index.ts` - Barrel re-exports: computeMMcK, computeEffectiveWorkers, computeSweep, findKneePoint, all types

## Decisions Made
- Auto-range multiplier 0.5x-2.5x of minimum stability workers ensures sweep always covers the knee region
- Grid clamping reduces both axes proportionally (sqrt approach) to stay under 500 points
- Kneedle uses local maximum of difference curve (not global), with sensitivity-based threshold filtering
- Fallback is always computed alongside Kneedle so callers always have a recommendation

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all functions are fully implemented with complete logic.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full math engine API complete: computeMMcK, computeEffectiveWorkers, computeSweep, findKneePoint
- All accessible via `import { ... } from './optimizer'`
- Ready for Phase 6 (Optimizer UI) to wire into React components
- 28 tests provide regression safety for UI integration work

## Self-Check: PASSED

---
*Phase: 05-math-engine*
*Completed: 2026-04-12*
