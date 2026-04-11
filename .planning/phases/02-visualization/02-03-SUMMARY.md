---
phase: 02-visualization
plan: 03
subsystem: ui
tags: [simulation-loop, raf, react-hook, canvas, uplot, integration, demo-config]

# Dependency graph
requires:
  - phase: 02-visualization-01
    provides: PodRenderer, PodCanvas, COLORS, visualization types
  - phase: 02-visualization-02
    provides: MetricsChartManager, MetricsCharts, AlignedData type
  - phase: 01-simulation-engine
    provides: SimulationEngine, SimulationConfig, SimulationSnapshot, MetricsSample types
provides:
  - SimulationLoop class (RAF-based bridge between wall-clock and simulation time)
  - useSimulation React hook (lifecycle management, auto-start, dark mode detection)
  - DEMO_CONFIG (hardcoded SimulationConfig for Phase 2 auto-run demo)
  - App.tsx layout (top-bottom PodCanvas + MetricsCharts, 1280px min width)
affects: [03-controls]

# Tech tracking
tech-stack:
  added: []
  patterns: [RAF loop with spiral-of-death clamp, simulation-time chart throttle at 1Hz, imperative renderer bridged to React via refs and callbacks]

key-files:
  created:
    - src/visualization/SimulationLoop.ts
    - src/visualization/SimulationLoop.test.ts
    - src/visualization/useSimulation.ts
    - src/visualization/demoConfig.ts
  modified:
    - src/App.tsx
    - src/App.css

key-decisions:
  - "100ms wall-delta clamp prevents spiral of death after tab switches (Pitfall 5 from research)"
  - "Chart updates throttled by simulation clock (not wall clock) to maintain consistent data density at any speed"
  - "useSimulation hook auto-starts simulation on mount with no user interaction (Phase 2 demo mode)"
  - "PodCanvas connected to SimulationLoop via onRendererReady/onCanvasResize callbacks rather than direct ref sharing"

patterns-established:
  - "RAF loop pattern: SimulationLoop owns the animation frame cycle, bridges wall-clock to sim-time, dispatches to renderers"
  - "Hook-to-imperative bridge: useSimulation creates plain class instances (engine, loop) and manages lifecycle via useEffect cleanup"
  - "Callback-based renderer connection: PodCanvas signals readiness via onRendererReady, loop receives PodRenderer without tight coupling"

requirements-completed: [VIZ-01, VIZ-02, VIZ-03, VIZ-04, MET-01, MET-02, MET-03, MET-04]

# Metrics
duration: 15min
completed: 2026-04-11
---

# Phase 02 Plan 03: Integration Wiring Summary

**RAF-based SimulationLoop bridges engine to Canvas/uPlot renderers with 100ms delta clamp, 1Hz chart throttle, and auto-running demo config (5 pods, 70/30 normal/slow)**

## Performance

- **Duration:** ~15 min (Task 1 implementation + checkpoint approval)
- **Started:** 2026-04-11T08:10:00Z
- **Completed:** 2026-04-11T08:25:00Z
- **Tasks:** 2 (1 auto TDD + 1 visual checkpoint)
- **Files modified:** 6

## Accomplishments
- SimulationLoop class drives the entire visualization pipeline: RAF tick -> engine.step -> PodRenderer.draw (every frame) -> chart update (1Hz sim-clock)
- useSimulation hook creates and manages engine/loop lifecycle, auto-starts on mount, detects dark mode via matchMedia
- DEMO_CONFIG provides hardcoded scenario: 5 pods, 4 workers, 50 RPS, 70/30 normal/slow split, seed 42
- App.tsx replaced Vite template with top-bottom layout: PodCanvas grid on top, 4 uPlot charts in 2x2 grid on bottom
- Cascading failure visible in browser: pods degrade green -> yellow -> red as slow requests consume workers

## Task Commits

Each task was committed atomically:

1. **Task 1: SimulationLoop, useSimulation hook, demoConfig, App.tsx wiring** - `ca9a023` (test RED), `9964134` (feat GREEN)
2. **Task 2: Visual verification of complete Phase 2 visualization** - checkpoint approved, no code changes

## Files Created/Modified
- `src/visualization/SimulationLoop.ts` - RAF-based loop: bridges wall-clock to sim-time, dispatches to renderers with speed multiplier and 100ms delta clamp
- `src/visualization/SimulationLoop.test.ts` - 5 tests: step timing, delta clamp, draw-every-frame, chart throttle, chart suppression
- `src/visualization/useSimulation.ts` - React hook: creates engine/loop, manages lifecycle, auto-starts, dark mode detection
- `src/visualization/demoConfig.ts` - Hardcoded SimulationConfig for Phase 2 demo (5 pods, 4 workers, 50 RPS, 70/30 split)
- `src/App.tsx` - Main layout: PodCanvas (top) + MetricsCharts (bottom), 1280px min-width, CSS variable theming
- `src/App.css` - Cleared (all styling via Tailwind and CSS variables in index.css)

## Decisions Made
- 100ms wall-delta clamp chosen per Pitfall 5 from research phase -- prevents simulation from trying to catch up after browser tab switch
- Chart throttle uses simulation clock (not wall clock) so data density is consistent regardless of playback speed
- PodCanvas connected via callback pattern (onRendererReady/onCanvasResize) to avoid tight coupling between hook and component
- App.css fully cleared -- all styling delegated to Tailwind utility classes and CSS custom properties in index.css

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 visualization is complete: simulation runs automatically with visual feedback in both Canvas and charts
- Ready for Phase 3 (controls): left sidebar with parameter panel, play/pause, speed slider, reset
- App.tsx layout designed for Phase 3 extension: content area is flex-col, Phase 3 wraps with flex-row parent for left sidebar

## Self-Check: PASSED

All 6 files verified present. Both task commits (ca9a023, 9964134) verified in git log. SUMMARY.md exists at expected path.

---
*Phase: 02-visualization*
*Completed: 2026-04-11*
