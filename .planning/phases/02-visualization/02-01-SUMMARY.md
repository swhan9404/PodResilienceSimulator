---
phase: 02-visualization
plan: 01
subsystem: ui
tags: [canvas, tailwind, uplot, visualization, dpi-scaling]

# Dependency graph
requires:
  - phase: 01-simulation-engine
    provides: PodSnapshot, WorkerSnapshot, PodState types for rendering input
provides:
  - COLORS constant and getThemeColors() for all visualization components
  - PodLayout type for grid layout calculations
  - PodRenderer class for Canvas 2D pod drawing
  - PodCanvas React component with DPI scaling and resize handling
  - Tailwind CSS integration via Vite plugin
  - uPlot + uplot-react installed for Plans 02-02 and 02-03
affects: [02-visualization-02, 02-visualization-03]

# Tech tracking
tech-stack:
  added: [uplot 1.6.32, uplot-react 1.2.4, tailwindcss 4.x, @tailwindcss/vite 4.x]
  patterns: [Canvas DPI scaling, ResizeObserver with dimension caching, imperative Canvas rendering outside React]

key-files:
  created:
    - src/visualization/colors.ts
    - src/visualization/types.ts
    - src/visualization/PodRenderer.ts
    - src/visualization/PodRenderer.test.ts
    - src/visualization/PodCanvas.tsx
  modified:
    - package.json
    - vite.config.ts
    - src/index.css

key-decisions:
  - "Pod grid column count uses lookup table matching UI-SPEC (not pure sqrt) for exact control at each pod count range"
  - "PodRenderer is a plain TS class with imperative draw() method, keeping Canvas rendering outside React reconciliation"
  - "PodCanvas exposes rendererRef, onRendererReady, and onCanvasResize callback props for Plan 03 SimulationLoop integration"

patterns-established:
  - "Canvas DPI scaling: multiply dimensions by devicePixelRatio, scale context"
  - "ResizeObserver with dimension comparison to prevent infinite loops"
  - "Semantic color constants in colors.ts with light/dark theme getter"

requirements-completed: [VIZ-01, VIZ-02, VIZ-03, VIZ-04]

# Metrics
duration: 3min
completed: 2026-04-11
---

# Phase 2 Plan 01: Pod Canvas Visualization Summary

**Canvas 2D pod renderer with DPI-aware scaling, grid layout per UI-SPEC column table, worker cells colored by request profile, backlog text, and probe glyph indicators -- plus Tailwind and uPlot dependency installation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-11T08:03:14Z
- **Completed:** 2026-04-11T08:06:20Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Installed all Phase 2 npm dependencies (uplot, uplot-react, tailwindcss, @tailwindcss/vite)
- Configured Tailwind CSS v4 via Vite plugin with light/dark CSS custom properties
- Implemented PodRenderer class that draws pod cards with state-colored borders, worker cell grid, backlog text, and probe history glyphs
- Created PodCanvas React component with DPI scaling, ResizeObserver, and callback props for Plan 03 integration
- 13 unit tests covering all pod count layout ranges and color constants

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and configure build tooling** - `c320a1e` (chore)
2. **Task 2 RED: Failing tests for PodRenderer layout and COLORS** - `a9a9a9b` (test)
3. **Task 2 GREEN: Implement PodRenderer, PodCanvas, colors, types** - `e319e27` (feat)

## Files Created/Modified
- `package.json` - Added uplot, uplot-react, tailwindcss, @tailwindcss/vite
- `vite.config.ts` - Added tailwindcss() Vite plugin
- `src/index.css` - Replaced Vite template styles with Tailwind v4 import and light/dark CSS vars
- `src/visualization/colors.ts` - Semantic color constants for pod states, workers, probes, charts
- `src/visualization/types.ts` - PodLayout and CanvasTheme interfaces
- `src/visualization/PodRenderer.ts` - Canvas 2D renderer: calculateLayout + PodRenderer class
- `src/visualization/PodRenderer.test.ts` - 13 tests for layout calculation and color constants
- `src/visualization/PodCanvas.tsx` - React component with DPI setup, ResizeObserver, callback props

## Decisions Made
- Used a lookup table for column counts (not pure `Math.ceil(Math.sqrt())`) to exactly match UI-SPEC column table at every pod count range
- Worker grid wraps at `Math.ceil(Math.sqrt(workersPerPod))` columns within each pod card
- Pod card minimum width set to 80px to ensure backlog/probe text is readable
- Probe glyphs use `+` and `x` characters (not Unicode checkmark/cross) for consistent Canvas font rendering

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PodRenderer and PodCanvas ready for Plan 03 SimulationLoop integration via rendererRef/onRendererReady/onCanvasResize props
- uPlot and uplot-react installed and ready for Plan 02 MetricsCharts implementation
- Tailwind CSS configured and ready for page layout in Plans 02 and 03

## Self-Check: PASSED

All 6 files verified present. All 3 commits verified in git log.
