---
phase: "04"
plan: "01"
subsystem: simulation-engine, store
tags: [critical-events, recovery-detection, report-data]
dependency_graph:
  requires: []
  provides: [CriticalEventTracker, CriticalEvents, ReportData, recovered-playback-state]
  affects: [simulation-engine, zustand-store, playback-controls]
tech_stack:
  added: []
  patterns: [write-once-event-tracking, frozen-report-data-at-recovery]
key_files:
  created:
    - src/simulation/CriticalEventTracker.ts
    - src/simulation/CriticalEventTracker.test.ts
  modified:
    - src/simulation/types.ts
    - src/simulation/engine.ts
    - src/simulation/engine.test.ts
    - src/store/useSimulationStore.ts
    - src/components/PlaybackControls.tsx
decisions:
  - "Write-once semantics for CriticalEventTracker: first call wins for readiness failure, liveness restart, all-pods-down"
  - "ReportData computed once at recovery and frozen in store -- no re-computation"
  - "Loop stopped automatically on recovery to prevent unnecessary RAF ticks"
metrics:
  duration_seconds: 188
  completed: "2026-04-11T14:16:04Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 137
  test_pass: 137
  files_created: 2
  files_modified: 5
---

# Phase 04 Plan 01: Critical Event Tracking & Recovery Detection Summary

CriticalEventTracker class with write-once event semantics integrated at 5 engine hook points, plus store recovery detection that computes frozen ReportData with critical events, 503 stats, and per-profile average response times.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CriticalEventTracker + engine integration | 476104c | CriticalEventTracker.ts, CriticalEventTracker.test.ts, types.ts, engine.ts, engine.test.ts |
| 2 | Store recovery detection + ReportData + PlaybackControls | 539d24a | useSimulationStore.ts, PlaybackControls.tsx |

## Implementation Details

### Task 1: CriticalEventTracker + Engine Integration (TDD)

- Created `CriticalEvents` interface with 7 nullable timestamp/podId fields
- Created `ReportData` interface for frozen report state
- Implemented `CriticalEventTracker` class with write-once-per-event semantics (first call wins for readiness failure, liveness restart, all-pods-down)
- Integrated tracker into `SimulationEngine` at 5 hook points:
  - `handleProbeAction`: records readiness failure and all-pods-down when `remove_from_lb` and ready count drops to 0
  - `handlePodRestart`: records liveness restart
  - `stopRequests`: records stop requests timestamp
  - `step`: records recovered timestamp when phase transitions
- Added `getCriticalEvents()` public method
- 6 unit tests for tracker, 2 integration tests for engine (8 new tests total)

### Task 2: Store Recovery Detection + ReportData + PlaybackControls

- Extended `PlaybackState` type with `'recovered'` state (exported as public type)
- Added `reportData: ReportData | null` field to store
- Recovery detection in `onChartUpdate` callback: when `snapshot.phase === 'recovered'`, computes:
  - Critical events from engine
  - Per-profile average response times (aggregated across all MetricsSamples, probes filtered out)
  - Recovery time, 503 rate, total stats
- Frozen `ReportData` set once in store, loop stopped automatically
- Reset clears `reportData` back to null
- PlaybackControls renders only Reset button in `'recovered'` state

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- TypeScript compilation: PASS (`npx tsc --noEmit` exit 0)
- All tests: 137 passed, 0 failed (`npx vitest run` exit 0)
- CriticalEventTracker unit tests: 6/6 passed
- Engine integration tests (new): 2/2 passed
- All existing tests: no regressions

## Self-Check: PASSED

- All 8 key files: FOUND
- Commit 476104c (Task 1): FOUND
- Commit 539d24a (Task 2): FOUND
