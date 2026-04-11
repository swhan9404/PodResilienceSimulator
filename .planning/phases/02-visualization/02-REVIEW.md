---
phase: 02-visualization
reviewed: 2026-04-11T17:30:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - package.json
  - src/App.css
  - src/App.tsx
  - src/index.css
  - src/visualization/MetricsChartManager.test.ts
  - src/visualization/MetricsChartManager.ts
  - src/visualization/MetricsCharts.tsx
  - src/visualization/PodCanvas.tsx
  - src/visualization/PodRenderer.test.ts
  - src/visualization/PodRenderer.ts
  - src/visualization/SimulationLoop.test.ts
  - src/visualization/SimulationLoop.ts
  - src/visualization/colors.ts
  - src/visualization/demoConfig.ts
  - src/visualization/types.ts
  - src/visualization/useSimulation.ts
  - vite.config.ts
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-04-11T17:30:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The visualization layer is well-structured with a clean separation between the simulation loop (plain class), chart data management, canvas rendering, and React integration. The architecture correctly keeps the hot path (SimulationLoop.tick) outside React's render cycle and throttles chart updates to 1Hz. Canvas rendering uses DPR-aware setup and ResizeObserver with debounce guards.

Five warnings were found: two non-null assertions on `canvas.getContext('2d')` that could crash silently, an `eslint-disable` missing dependency array issue in `useSimulation` that would cause stale closures if `config` ever becomes dynamic, new arrays created on every render in `useSimulation` return, and a potential first-frame negative delta in `SimulationLoop.tick`. Three informational items were noted.

## Warnings

### WR-01: Non-null assertion on canvas.getContext('2d') can crash

**File:** `src/visualization/PodCanvas.tsx:15`
**Issue:** `canvas.getContext('2d')!` uses the non-null assertion operator. While `getContext('2d')` almost never returns `null` in practice, it can return `null` if the context has already been acquired with a different type (e.g., `'webgl'`), or in constrained environments. The same pattern appears on line 54 inside the ResizeObserver callback. If `null` is returned, the `PodRenderer` constructor receives `null` and all subsequent `ctx.*` calls will throw at runtime with an opaque error.

**Fix:**
```typescript
function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  return ctx;
}
```
Then guard the callers (lines 28-31, 53-55) with an early return when `ctx` is `null`.

### WR-02: useEffect ignores `config` dependency -- stale closure if config becomes dynamic

**File:** `src/visualization/useSimulation.ts:53`
**Issue:** The `useEffect` dependency array is `[]` with a comment that `config` is stable because it is `DEMO_CONFIG`. This works today, but if `config` ever becomes a prop or state (which Phase 3 will likely require when users can change parameters), the effect will capture the initial config value and never re-initialize the engine. This is a latent bug that will surface the moment the hook is used with a dynamic config.

**Fix:** Either add `config` to the dependency array now (the effect already cleans up via `loop.stop()`), or add a prominent guard:
```typescript
// If you make config dynamic, you MUST add it to the dependency array below
// and ensure the effect re-runs, cleaning up the previous engine/loop.
useEffect(() => {
  // ...existing code...
}, [config]);
```

### WR-03: New arrays created on every render for profileNames/profileColors

**File:** `src/visualization/useSimulation.ts:75-76`
**Issue:** `config.requestProfiles.map(p => p.name)` and `.map(p => p.color)` create new array references on every render of the consuming component. Since these are passed as props to `MetricsCharts`, and `MetricsCharts` uses them in a `useMemo` dependency array (line 162), the response time chart options object will be re-created on every render, defeating the memoization.

**Fix:** Memoize these values with `useMemo`:
```typescript
const profileNames = useMemo(
  () => config.requestProfiles.map(p => p.name),
  [config.requestProfiles],
);
const profileColors = useMemo(
  () => config.requestProfiles.map(p => p.color),
  [config.requestProfiles],
);
```

### WR-04: First tick can produce a negative wallDelta

**File:** `src/visualization/SimulationLoop.ts:76`
**Issue:** `lastTimestamp` is initialized to `0` (line 21). The `start()` method sets it to `performance.now()` (line 60), then calls `requestAnimationFrame(this.tick)`. However, `tick()` is also exposed publicly for testing. If `start()` is called and then the rAF callback fires with a timestamp slightly less than `performance.now()` (which can happen because `performance.now()` and the rAF timestamp use different timing origins in some browsers), `wallDelta` would be negative. `Math.min(wallDelta, 100)` does not clamp negative values, resulting in a negative `simDelta` passed to `engine.step()`.

**Fix:** Clamp the lower bound:
```typescript
const clampedDelta = Math.min(Math.max(wallDelta, 0), 100);
```

### WR-05: Dark mode event listener in PodCanvas has empty handler

**File:** `src/visualization/PodCanvas.tsx:39-41`
**Issue:** The dark mode `change` event listener is registered but the handler is empty. The comment says "Re-draw will pick up new theme on next frame," which is true since `SimulationLoop.tick()` calls `draw()` every frame. However, the `isDark` flag in `SimulationLoop` is set by `useSimulation.ts` (line 41-42), not by `PodCanvas`. This means `PodCanvas` registers a listener that does nothing and never will -- it is dead code that misleads future maintainers into thinking dark mode is handled here.

**Fix:** Remove the dead dark mode listener from `PodCanvas.tsx` (lines 38-41, and line 62):
```typescript
// Remove these lines -- dark mode is handled by useSimulation.ts
// const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
// const handleDarkChange = () => {};
// darkMq.addEventListener('change', handleDarkChange);
// ...
// darkMq.removeEventListener('change', handleDarkChange);
```

## Info

### IN-01: CanvasTheme interface is unused

**File:** `src/visualization/types.ts:11-13`
**Issue:** The `CanvasTheme` interface is exported but never imported or referenced anywhere in the codebase. The actual theme handling uses `getThemeColors()` from `colors.ts`, which returns a `ThemeColors` interface.

**Fix:** Remove the unused `CanvasTheme` interface from `types.ts`.

### IN-02: EMPTY_DATA defined in two places

**File:** `src/visualization/MetricsCharts.tsx:106` and `src/visualization/useSimulation.ts:16`
**Issue:** `const EMPTY_DATA: ... = [[], []]` is defined identically in both files. This is minor duplication; the types differ slightly (`uPlot.AlignedData` vs the local `AlignedData`), so sharing may not be trivial, but it is worth noting.

**Fix:** Consider exporting a single `EMPTY_DATA` from `MetricsChartManager.ts` (which already defines the `AlignedData` type) and importing it in both files.

### IN-03: handleDarkChange comment in PodCanvas is misleading

**File:** `src/visualization/PodCanvas.tsx:40`
**Issue:** The comment `// Re-draw will pick up new theme on next frame` implies this handler contributes to dark mode support, but the handler body is empty and the actual dark mode mechanism is in `useSimulation.ts`. This is closely related to WR-05 but called out separately as a documentation/clarity issue.

**Fix:** Addressed by WR-05 (remove the dead code entirely).

---

_Reviewed: 2026-04-11T17:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
