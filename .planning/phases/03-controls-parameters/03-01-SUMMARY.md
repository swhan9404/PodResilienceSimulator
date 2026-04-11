---
phase: 03-controls-parameters
plan: 01
subsystem: ui
tags: [zustand, react, state-management, form-components, tailwind]

# Dependency graph
requires:
  - phase: 02-visualization
    provides: SimulationEngine, SimulationLoop, MetricsChartManager, PodCanvas, MetricsCharts
provides:
  - Zustand store (useSimulationStore) with config, playback, engine refs, and lifecycle actions
  - Reusable NumberInput and ParamSection form components
  - Parameter form sections (Cluster, Traffic, Probe, Pod)
  - ControlPanel left sidebar container (300px fixed width)
  - Side-by-side App layout (left panel + right visualization)
affects: [03-controls-parameters plan-02, 03-controls-parameters plan-03]

# Tech tracking
tech-stack:
  added: [zustand 5.x]
  patterns: [zustand-store-with-engine-refs, pre-normalization-ratios, selector-per-field]

key-files:
  created:
    - src/store/useSimulationStore.ts
    - src/components/NumberInput.tsx
    - src/components/ParamSection.tsx
    - src/components/ClusterParams.tsx
    - src/components/TrafficParams.tsx
    - src/components/ProbeParams.tsx
    - src/components/PodParams.tsx
    - src/components/ControlPanel.tsx
  modified:
    - src/App.tsx
    - package.json

key-decisions:
  - "Zustand store holds engine/loop as plain refs, not React state -- per D-10 non-serializable pattern"
  - "DEFAULT_CONFIG uses pre-normalization ratios (7:3) so users see raw editable values; normalizeRatios() runs on start()"
  - "Dark mode listener stored in module-level variable for cleanup on reset()"

patterns-established:
  - "Zustand selector pattern: one selector per field to minimize re-renders"
  - "NumberInput NaN guard: only propagate valid numbers to store"
  - "ParamSection collapsible wrapper for all parameter groups"
  - "Disabled state derived from playback !== 'idle' in each param component"

requirements-completed: [PAR-01, PAR-02, PAR-04, PAR-05, PAR-06]

# Metrics
duration: 3min
completed: 2026-04-11
---

# Phase 3 Plan 1: Controls & Parameters - Store and Parameter Forms Summary

**Zustand store with simulation lifecycle actions, 300px left sidebar with Cluster/Traffic/Probe/Pod parameter forms, side-by-side App layout**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-11T12:47:10Z
- **Completed:** 2026-04-11T12:49:49Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Zustand store created as single source of truth for config, playback state, engine refs, and all lifecycle actions (start/pause/resume/reset/stopRequests/setSpeed)
- Parameter form sections (Cluster, Traffic, Liveness Probe, Readiness Probe, Pod) with editable number inputs disabled during simulation run
- App.tsx refactored from useSimulation hook to Zustand store, with side-by-side layout (300px left panel + remaining right visualization)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Zustand and create simulation store** - `6525db8` (feat)
2. **Task 2: Build parameter form components, ControlPanel container, and refactor App layout** - `a482ee2` (feat)

## Files Created/Modified
- `src/store/useSimulationStore.ts` - Zustand store with config, playback, engine refs, normalizeRatios helper
- `src/components/NumberInput.tsx` - Reusable labeled number input with NaN guard
- `src/components/ParamSection.tsx` - Collapsible section wrapper with chevron toggle
- `src/components/ClusterParams.tsx` - PAR-01: podCount, workersPerPod, maxBacklogPerPod
- `src/components/TrafficParams.tsx` - PAR-02: rps
- `src/components/ProbeParams.tsx` - PAR-04/05: reusable for liveness/readiness probe fields
- `src/components/PodParams.tsx` - PAR-06: initializeTimeMs, seed
- `src/components/ControlPanel.tsx` - 300px left panel assembling all param sections with Plan 02 placeholders
- `src/App.tsx` - Refactored to side-by-side layout using store instead of useSimulation hook
- `package.json` - Added zustand dependency

## Decisions Made
- Zustand store holds engine/loop as plain refs (not React state) per D-10, avoiding unnecessary re-renders for non-serializable objects
- DEFAULT_CONFIG uses pre-normalization ratios (7:3 instead of 0.7:0.3) so users see raw editable values; normalizeRatios() runs at start()
- Dark mode listener cleanup stored in module-level variable rather than in store state to keep store serializable
- onChartUpdate callback piggybacks throttled status updates (~1Hz) rather than adding a separate timer

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

| File | Line | Description | Resolved By |
|------|------|-------------|-------------|
| src/components/ControlPanel.tsx | 10 | Empty div placeholder for StatusDisplay | Plan 02 |
| src/components/ControlPanel.tsx | 12 | Empty div placeholder for PlaybackControls | Plan 02 |
| src/components/ControlPanel.tsx | 16 | Comment placeholder for RequestProfileList | Plan 02 |

These are intentional Plan 02 integration points, not blocking stubs.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Store and parameter forms ready for Plan 02 to add PlaybackControls, SpeedControl, StatusDisplay, and RequestProfileList
- useSimulation.ts and demoConfig.ts still in codebase but no longer imported from App.tsx; can be cleaned up in Plan 02

## Self-Check: PASSED

All 8 created files verified present. Both task commits (6525db8, a482ee2) verified in git log. SUMMARY file exists.

---
*Phase: 03-controls-parameters*
*Completed: 2026-04-11*
