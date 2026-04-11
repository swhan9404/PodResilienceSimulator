# Phase 2: Visualization - Research

**Researched:** 2026-04-11
**Domain:** Real-time Canvas rendering + uPlot time-series charts for simulation visualization
**Confidence:** HIGH

## Summary

Phase 2 transforms the headless simulation engine (Phase 1) into a visual experience. Two rendering pipelines must be built: (1) a Canvas 2D renderer that draws pod states, workers, backlogs, and probe indicators at 60fps, and (2) four uPlot time-series charts that update at 1Hz (throttled to match MetricsSample intervals). A `requestAnimationFrame`-based simulation loop bridges wall-clock time to simulation time, calling `engine.step(deltaMs * speed)` each frame and distributing the resulting snapshot to both renderers.

The key technical challenges are: uPlot streaming data management (no native append API -- must construct `AlignedData` arrays and call `setData()` per update), Canvas DPI scaling for retina displays, and keeping React out of the hot rendering path. Phase 1's architecture already enforces the critical separation: engine state lives in plain TS classes, Canvas draws happen imperatively via refs, and only throttled UI text updates flow through React state.

**Primary recommendation:** Build the rendering pipeline as three plain TypeScript classes (`PodRenderer`, `MetricsChartManager`, `SimulationLoop`) + one React hook (`useSimulation`) + two thin React components (`PodCanvas`, `MetricsCharts`). Install uPlot/uplot-react/Tailwind as new dependencies. Phase 2 auto-runs with hardcoded demo config -- no controls needed (Phase 3).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pod layout is Claude's discretion -- auto-decide grid columns based on pod count
- **D-02:** Worker slot rendered as individual cells -- idle=gray, busy=request profile color (VIZ-02)
- **D-03:** Backlog shown as text only ("BL: 7/10"), not a fill bar
- **D-04:** Pod border color: Ready=green, NotReady=yellow, Restarting=red (VIZ-04)
- **D-05:** Probe results: per-pod last N liveness/readiness shown as checkmark/cross (VIZ-03)
- **D-06:** Chart time window fixed 60 simulated seconds, no scrolling
- **D-07:** 4 charts in 2x2 grid: Worker Usage % / Ready Pods / 503 Rate % / Response Time ms
- **D-08:** uPlot + uplot-react wrapper
- **D-09:** requestAnimationFrame loop -- each frame calls engine.step(deltaTime * speed), snapshot to Canvas
- **D-10:** Canvas updates every frame (60fps), Chart updates throttled to 1Hz (matches 1s metric sample)
- **D-11:** Phase 2 is auto-run only (hardcoded config), start/pause/speed controls in Phase 3
- **D-12:** Top-bottom layout: Pod Canvas grid (top), 2x2 Charts (bottom)
- **D-13:** Structure must accommodate Phase 3 left-side parameter panel
- **D-14:** Desktop only (1280px+ minimum width)

### Claude's Discretion
- Pod grid column count (auto from pod count)
- Canvas spacing, padding, font sizes
- uPlot chart colors and styling

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIZ-01 | Canvas shows pod workers (idle/busy), backlog fill, probe status in real time | PodRenderer class draws snapshot.pods using Canvas 2D API. Layout from UI-SPEC pod card internal layout. |
| VIZ-02 | Busy workers colored by request profile color | WorkerSnapshot.profileColor consumed directly. Color map in UI-SPEC. |
| VIZ-03 | Pod probe results shown as checkmark/cross for last N outcomes | PodSnapshot.livenessHistory/readinessHistory arrays rendered as Unicode glyphs (U+2713/U+2717). |
| VIZ-04 | Pod border color by state (green/yellow/red) | PodSnapshot.state mapped to hex colors per UI-SPEC semantic color table. |
| MET-01 | Worker usage % time-series chart | Computed from MetricsSample: (activeWorkerCount / totalWorkerCount) * 100. uPlot line chart. |
| MET-02 | Ready pod count time-series chart | MetricsSample.readyPodCount plotted directly. uPlot line chart. |
| MET-03 | 503 rate % time-series chart | Computed from MetricsSample: (total503s / max(totalRequests + total503s, 1)) * 100. uPlot line chart. |
| MET-04 | Per-profile response time time-series chart | MetricsSample.perProfileResponseTime -- one series per profile. uPlot multi-line chart. |
</phase_requirements>

## Standard Stack

### Core (Phase 2 additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| uplot | 1.6.32 | Time-series charts | 545KB, Canvas-based, designed for streaming time-series. Handles 100K+ points. No dependencies. [VERIFIED: npm registry] |
| uplot-react | 1.2.4 | React lifecycle wrapper for uPlot | Handles create/update/destroy. Peer dep: react >=16.8.6 (React 19 compatible). resetScales prop. [VERIFIED: npm registry] |
| tailwindcss | 4.2.2 | Utility CSS for layout | CSS-first config (v4), no tailwind.config.js needed. Page layout, section spacing. [VERIFIED: npm registry -- already in CLAUDE.md stack] |
| @tailwindcss/vite | 4.2.2 | Vite plugin for Tailwind v4 | Official integration, replaces PostCSS setup. [VERIFIED: npm registry] |

### Already Installed (from Phase 1)

| Library | Version | Purpose |
|---------|---------|---------|
| react | ^19.2.4 | UI framework |
| react-dom | ^19.2.4 | DOM rendering |
| typescript | ~5.7.0 | Type safety |
| vite | ^8.0.4 | Build tool |
| vitest | ^4.1.4 | Unit testing |

### Not Yet Installed (must install in Phase 2)

| Package | Install Command | Notes |
|---------|----------------|-------|
| uplot | `npm install uplot` | Runtime dependency |
| uplot-react | `npm install uplot-react` | Runtime dependency |
| tailwindcss | `npm install -D tailwindcss @tailwindcss/vite` | Dev dependency |

**Installation:**
```bash
npm install uplot uplot-react
npm install -D tailwindcss @tailwindcss/vite
```

**Vite config update required:** Add `@tailwindcss/vite` plugin to `vite.config.ts`.

**CSS import required:** Add `@import "tailwindcss"` to `src/index.css` (Tailwind v4 pattern).

**uPlot CSS required:** Import `uplot/dist/uPlot.min.css` in the chart component.

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
src/
  simulation/            # Phase 1 (unchanged)
    engine.ts
    pod.ts
    types.ts
    metrics.ts
    ...
  visualization/         # Phase 2 (NEW)
    PodCanvas.tsx         # React component: canvas ref + resize handling
    PodRenderer.ts        # Plain TS class: draws pods on Canvas 2D context
    MetricsCharts.tsx     # React component: 4 uPlot charts in 2x2 grid
    MetricsChartManager.ts # Plain TS class: manages data arrays + setData calls
    SimulationLoop.ts     # Plain TS class: RAF orchestrator
    useSimulation.ts      # React hook: bridges engine + loop to React lifecycle
    layout.ts             # Pod grid layout calculator (column/row math)
    colors.ts             # Semantic color constants (pod states, idle worker, etc.)
    types.ts              # Visualization-specific types (layout rects, chart config)
  App.tsx                 # Replaces default Vite template with simulation UI
  main.tsx                # Entry point (unchanged)
  index.css               # Updated with Tailwind import + dark mode vars
```

### Pattern 1: SimulationLoop (RAF Bridge)
**What:** A plain TypeScript class that owns the `requestAnimationFrame` loop, calls `engine.step()`, distributes snapshots to Canvas and Chart renderers.
**When to use:** Always -- this is the central orchestration pattern.
**Key detail:** Clamps wall-clock delta to 100ms max to prevent "spiral of death" after tab switch. At 100x speed, max 10 simulated seconds per frame.

```typescript
// [VERIFIED: ARCHITECTURE.md pattern, adapted for D-09, D-10, D-11]
class SimulationLoop {
  private engine: SimulationEngine;
  private podRenderer: PodRenderer;
  private chartManager: MetricsChartManager;
  private speed: number = 1;
  private lastTimestamp: number = 0;
  private rafHandle: number = 0;
  private lastChartUpdate: number = 0;
  private chartThrottleMs: number = 1000; // 1Hz per D-10

  private tick = (timestamp: number): void => {
    const wallDelta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    const clampedDelta = Math.min(wallDelta, 100);
    const simDelta = clampedDelta * this.speed;

    this.engine.step(simDelta);
    const snapshot = this.engine.getSnapshot();

    // Canvas: every frame (D-10)
    this.podRenderer.draw(snapshot.pods);

    // Charts: throttled to 1Hz sim-time (D-10)
    if (snapshot.clock - this.lastChartUpdate >= this.chartThrottleMs) {
      this.chartManager.update(snapshot.metrics, snapshot.clock);
      this.lastChartUpdate = snapshot.clock;
    }

    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
```

### Pattern 2: uPlot Streaming Data (Sliding Window)
**What:** Maintain growing arrays of time-series data. On each update, slice the last 60 seconds of simulated time and call `uPlot.setData()`.
**Key insight:** uPlot has no native "append" API. `setData(data)` replaces the entire dataset. The sliding window is implemented by the caller. [VERIFIED: uPlot stream-data.html demo, GitHub issue #1122]

```typescript
// [CITED: github.com/leeoniya/uPlot/blob/master/demos/stream-data.html]
class MetricsChartManager {
  private timeData: number[] = [];
  private workerUsage: number[] = [];
  // ... other series arrays

  update(metrics: MetricsSample[], currentClock: number): void {
    // Append new samples since last update
    for (const sample of newSamples) {
      this.timeData.push(sample.time / 1000); // uPlot expects seconds
      this.workerUsage.push(
        (sample.activeWorkerCount / sample.totalWorkerCount) * 100
      );
    }

    // Slice to 60-second window (D-06)
    const windowStart = (currentClock / 1000) - 60;
    const startIdx = this.timeData.findIndex(t => t >= windowStart);
    const sliced = [
      this.timeData.slice(startIdx),
      this.workerUsage.slice(startIdx),
    ];

    this.uplotInstance.setData(sliced, false); // resetScales=false for streaming
  }
}
```

### Pattern 3: Canvas DPI Scaling
**What:** Set canvas pixel dimensions to CSS dimensions x devicePixelRatio. Scale context. This prevents blurry text/lines on Retina displays.
**Must be done once on mount and on resize.**

```typescript
// [CITED: developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio]
function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}
```

### Pattern 4: React Component with Imperative Canvas
**What:** React component owns the `<canvas>` element via ref. Passes the 2D context to PodRenderer (plain TS class). React does NOT re-render on each frame.

```typescript
// PodCanvas.tsx pattern
function PodCanvas({ snapshotRef }: { snapshotRef: React.RefObject<SimulationSnapshot> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PodRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = setupCanvas(canvas);
    rendererRef.current = new PodRenderer(ctx, canvas.getBoundingClientRect());
    // ResizeObserver for responsive sizing
    const observer = new ResizeObserver(() => {
      setupCanvas(canvas);
      rendererRef.current?.updateLayout(canvas.getBoundingClientRect());
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return <canvas ref={canvasRef} className="w-full" style={{ height: 'auto' }} />;
}
```

### Anti-Patterns to Avoid
- **React state for per-frame data:** Never `useState(snapshot)` at 60fps. Engine snapshot flows imperatively to Canvas, not through React state.
- **Recreating uPlot on data change:** Use `setData()`, never unmount/remount the chart component on each update.
- **Canvas without DPI scaling:** Blurry on all modern displays. Must scale from day one (Pitfall #12).
- **Unbounded metric arrays:** Without windowing, memory grows linearly with simulation duration. Always slice to 60-second window before passing to uPlot.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time-series charting | Custom Canvas chart renderer | uPlot 1.6.32 | Axes, gridlines, tooltips, anti-aliased lines, auto-scaling -- hundreds of edge cases |
| Chart React lifecycle | Manual useEffect with uPlot constructor | uplot-react 1.2.4 | Handles mount/update/destroy, avoids memory leaks, resetScales management |
| CSS layout (page structure) | Custom CSS from scratch | Tailwind CSS 4.2.2 | Grid, flexbox, spacing, dark mode -- all via utility classes |
| Responsive canvas sizing | Manual window.onresize | ResizeObserver API | Handles element-level resize, not just window. Works with CSS grid/flex layouts. |

**Key insight:** The only hand-rolled rendering in Phase 2 is the Pod Canvas (PodRenderer class). This is appropriate because the pod visualization is a simple grid of rectangles with text -- ~200 lines of Canvas 2D draw calls. Everything else uses established libraries.

## Common Pitfalls

### Pitfall 1: uPlot setData with resetScales
**What goes wrong:** Calling `uPlot.setData(data)` without the second parameter defaults to `resetScales=true`. On every chart update, axes snap back to auto-scale, causing visual "jumping" as the Y range constantly readjusts.
**Why it happens:** The default is designed for replacing entire datasets, not streaming updates.
**How to avoid:** Always pass `uPlot.setData(data, false)` for streaming updates. The uplot-react wrapper exposes `resetScales` prop -- set it to `false`.
**Warning signs:** Chart Y-axis range fluctuates wildly on each 1-second update.
[VERIFIED: GitHub issue #268, uPlot API docs]

### Pitfall 2: uPlot Time Axis Expects Seconds (Not Milliseconds)
**What goes wrong:** Simulation clock is in milliseconds (integer ms per SIM-04). uPlot's time axis expects Unix timestamps in seconds. Passing ms directly shows year 50,000+ on the X axis.
**Why it happens:** uPlot is designed for real-world timestamps (epoch seconds), not relative simulation time.
**How to avoid:** Divide simulation time by 1000 when constructing uPlot data arrays. Or use a custom axis formatter that treats values as relative seconds.
**Warning signs:** X-axis labels show absurdly large dates instead of "0s", "30s", "60s".
[ASSUMED -- based on uPlot being a time-series library with Unix time conventions]

### Pitfall 3: Canvas Not Cleared Before Redraw
**What goes wrong:** Forgetting `ctx.clearRect()` at the start of each frame causes all previous frames to persist, creating a smeared/overlapping visual mess.
**How to avoid:** First line of every `draw()` call: `ctx.clearRect(0, 0, width, height)`.
[VERIFIED: standard Canvas 2D pattern, MDN docs]

### Pitfall 4: ResizeObserver Infinite Loop with Canvas
**What goes wrong:** ResizeObserver fires, code resizes canvas, which triggers another ResizeObserver notification, creating an infinite loop.
**How to avoid:** Compare new dimensions with cached previous dimensions. Only re-setup canvas if dimensions actually changed.
**Warning signs:** Browser logs "ResizeObserver loop completed with undelivered notifications" warning.
[VERIFIED: known browser behavior, MDN ResizeObserver documentation]

### Pitfall 5: Spiral of Death After Tab Switch
**What goes wrong:** User switches to another tab for 30 seconds. On return, `requestAnimationFrame` reports a 30-second wall delta. At 100x speed, engine tries to advance 3000 simulated seconds in one frame. Browser freezes.
**How to avoid:** Clamp wall delta to max 100ms per frame. Already documented in ARCHITECTURE.md SimulationLoop pattern.
**Warning signs:** UI freezes for several seconds after switching back to the tab.
[VERIFIED: ARCHITECTURE.md, standard RAF pattern]

### Pitfall 6: Memory Leak from Metrics Arrays
**What goes wrong:** MetricsSample arrays grow unboundedly. At 100x speed for a 5-minute session = 30,000 samples. The full array is passed to uPlot setData every second.
**How to avoid:** Keep the full history in MetricsCollector (needed for future reports in Phase 4), but only pass the last 60 seconds of data (windowed) to uPlot. This bounds the chart data to ~60 samples maximum.
**Warning signs:** Increasing memory usage over time, chart updates getting slower.
[VERIFIED: PITFALLS.md Pitfall #8]

## Code Examples

### uPlot Options for Worker Usage Chart
```typescript
// [CITED: github.com/leeoniya/uPlot/blob/master/dist/uPlot.d.ts]
import uPlot from 'uplot';

const workerUsageOpts: uPlot.Options = {
  width: 400,  // will be overridden by ResizeObserver
  height: 200, // per UI-SPEC chart height
  series: [
    {}, // x-axis (time) series -- empty config
    {
      label: 'Worker Usage',
      stroke: '#3B82F6', // blue per UI-SPEC
      width: 2,
      fill: 'rgba(59, 130, 246, 0.1)', // 10% opacity per UI-SPEC
    },
  ],
  axes: [
    {
      // x-axis: relative simulation time in seconds
      values: (u: uPlot, vals: number[]) =>
        vals.map(v => `${Math.round(v)}s`),
    },
    {
      // y-axis: percentage
      values: (u: uPlot, vals: number[]) =>
        vals.map(v => `${Math.round(v)}%`),
    },
  ],
  scales: {
    y: { min: 0, max: 100 },
  },
};
```

### uPlot AlignedData Format
```typescript
// [CITED: uPlot.d.ts AlignedData type]
// uPlot.AlignedData = [xValues: number[], ...yValues: (number | null | undefined)[][]]
// For Worker Usage chart:
const data: uPlot.AlignedData = [
  [0, 1, 2, 3, 4],          // time in seconds (sim clock / 1000)
  [25.0, 50.0, 75.0, 100.0, 87.5], // worker usage %
];
```

### uplot-react Component Usage
```typescript
// [CITED: npmjs.com/package/uplot-react]
import UplotReact from 'uplot-react';
import 'uplot/dist/uPlot.min.css';

function WorkerUsageChart({ data }: { data: uPlot.AlignedData }) {
  return (
    <UplotReact
      options={workerUsageOpts}
      data={data}
      resetScales={false}  // CRITICAL for streaming
      onCreate={(chart) => { /* store ref for resize */ }}
    />
  );
}
```

### PodRenderer Draw Pattern
```typescript
// [VERIFIED: Canvas 2D API, MDN docs]
class PodRenderer {
  private ctx: CanvasRenderingContext2D;
  private layout: { cols: number; cellWidth: number; cellHeight: number; gap: number };

  draw(pods: PodSnapshot[]): void {
    const { width, height } = this.ctx.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    pods.forEach((pod, i) => {
      const col = i % this.layout.cols;
      const row = Math.floor(i / this.layout.cols);
      const x = col * (this.layout.cellWidth + this.layout.gap);
      const y = row * (this.layout.cellHeight + this.layout.gap);
      this.drawPod(pod, x, y);
    });
  }

  private drawPod(pod: PodSnapshot, x: number, y: number): void {
    // Border color by state (D-04, VIZ-04)
    const borderColor = pod.state === 'READY' ? '#22C55E'
      : pod.state === 'NOT_READY' ? '#F59E0B'
      : '#EF4444'; // RESTARTING

    // Pod card background + border
    this.ctx.strokeStyle = borderColor;
    this.ctx.lineWidth = 3;
    // ... draw rounded rect, worker cells, backlog text, probe indicators
  }
}
```

### Auto-Run Demo Config (Phase 2 Hardcoded)
```typescript
// [VERIFIED: UI-SPEC Auto-Run Demo Config table]
import type { SimulationConfig } from '../simulation/types';

export const DEMO_CONFIG: SimulationConfig = {
  podCount: 5,
  workersPerPod: 4,
  maxBacklogPerPod: 10,
  rps: 50,
  requestProfiles: [
    { name: 'normal', latencyMs: 200, ratio: 0.7, color: '#3B82F6' },
    { name: 'slow', latencyMs: 5000, ratio: 0.3, color: '#F97316' },
  ],
  livenessProbe: { periodSeconds: 10, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
  readinessProbe: { periodSeconds: 5, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
  initializeTimeMs: 30000,
  seed: 42,
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart.js for time-series | uPlot for high-frequency streaming | 2020+ | 12x smaller, native streaming design |
| DOM-based pod rendering | Canvas 2D imperative rendering | Always for >10 elements at 60fps | Zero React reconciliation overhead |
| window.onresize for canvas | ResizeObserver on container | 2019+ (widely supported) | Element-level, works in flex/grid |
| Manual uPlot lifecycle in React | uplot-react wrapper | 2023+ (v1.2.x) | Handles create/update/destroy correctly |
| backingStorePixelRatio for DPI | window.devicePixelRatio only | 2020+ (backingStorePixelRatio deprecated) | Simpler, one-line DPR check |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | uPlot time axis expects seconds, not milliseconds | Pitfall 2 | X-axis labels wrong; fixable with custom formatter -- low risk |
| A2 | uplot-react resetScales=false prop works correctly for streaming | Pattern 2 | If broken, fall back to direct uPlot instance management via ref -- medium risk |
| A3 | Tailwind v4 CSS-first `@import "tailwindcss"` works without config file | Architecture | If not, add postcss.config or revert to v3 config pattern -- low risk |

## Open Questions

1. **uPlot X-axis as Relative Time**
   - What we know: uPlot is designed for Unix timestamps. Our simulation uses relative time starting from 0.
   - What's unclear: Whether uPlot auto-formats relative seconds correctly or if it tries to parse them as dates.
   - Recommendation: Use custom axis `values` formatter that renders `${seconds}s`. This sidesteps the issue entirely. Low risk.

2. **MET-04 Response Time Chart: Multi-Series for Dynamic Profiles**
   - What we know: Response time chart needs one line per request profile. Demo config has 2 profiles (normal, slow).
   - What's unclear: uPlot series must be defined at chart creation. If profile count changes, chart must be recreated.
   - Recommendation: For Phase 2 (hardcoded config), series count is fixed. Define series at chart creation. Phase 3 can handle dynamic profiles if needed.

3. **Dark Mode Detection for Canvas**
   - What we know: UI-SPEC defines light/dark color variants for Canvas elements.
   - What's unclear: How to detect dark mode from within Canvas renderer (no CSS access).
   - Recommendation: Use `window.matchMedia('(prefers-color-scheme: dark)')` at mount time and listen for changes. Pass a `theme` parameter to PodRenderer.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install, dev server | Yes | (installed, runs Vite) | -- |
| uplot | Charts (MET-01..04) | Not installed | 1.6.32 on npm | npm install |
| uplot-react | Chart React wrapper | Not installed | 1.2.4 on npm | npm install |
| tailwindcss | Page layout (D-12..14) | Not installed | 4.2.2 on npm | npm install -D |
| @tailwindcss/vite | Vite integration | Not installed | 4.2.2 on npm | npm install -D |
| Canvas 2D API | Pod visualization | Yes (browser built-in) | -- | -- |
| ResizeObserver | Canvas/chart resizing | Yes (browser built-in, 95%+ support) | -- | -- |
| requestAnimationFrame | Render loop | Yes (browser built-in) | -- | -- |

**Missing dependencies with no fallback:**
- None (all missing items are npm-installable)

**Missing dependencies with fallback:**
- uplot, uplot-react, tailwindcss, @tailwindcss/vite -- all must be installed via npm before implementation

## Security Domain

Not applicable for Phase 2. This phase is entirely client-side Canvas/chart rendering with no user input handling, network requests, authentication, or data persistence. Phase 3 (controls/parameters) may need input validation.

## Sources

### Primary (HIGH confidence)
- [uPlot npm registry](https://www.npmjs.com/package/uplot) - version 1.6.32 verified
- [uplot-react npm registry](https://www.npmjs.com/package/uplot-react) - version 1.2.4, peer dep react >=16.8.6
- [uPlot stream-data demo](https://github.com/leeoniya/uPlot/blob/master/demos/stream-data.html) - streaming pattern with setData + slicing
- [uPlot TypeScript definitions](https://github.com/leeoniya/uPlot/blob/master/dist/uPlot.d.ts) - AlignedData type, setData(data, resetScales) signature
- [MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) - Canvas DPI scaling pattern
- [web.dev Canvas HiDPI](https://web.dev/articles/canvas-hidipi) - DPI setup function pattern
- Phase 1 source code: `src/simulation/types.ts`, `engine.ts`, `metrics.ts`, `pod.ts` - snapshot interfaces verified
- `.planning/research/ARCHITECTURE.md` - 3-tier state, SimulationLoop pattern, component boundaries
- `.planning/research/PITFALLS.md` - 16 documented pitfalls, Phase 2 relevant: #4, #8, #10, #12, #16
- `.planning/phases/02-visualization/02-UI-SPEC.md` - complete visual contract (colors, spacing, typography, layout)

### Secondary (MEDIUM confidence)
- [uPlot GitHub issues #1122](https://github.com/leeoniya/uPlot/issues/1122) - streaming strategies discussion (Jan 2026)
- [uPlot GitHub issues #268](https://github.com/leeoniya/uPlot/issues/268) - setData resetScales=false behavior
- [uplot-wrappers GitHub](https://github.com/skalinichev/uplot-wrappers) - wrapper props interface documentation

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all versions verified against npm registry, peer deps confirmed compatible
- Architecture: HIGH - patterns from ARCHITECTURE.md are well-established (RAF loop, Canvas 2D, snapshot rendering), Phase 1 code structure already exists
- Pitfalls: HIGH - most pitfalls documented in PITFALLS.md and verified against official sources (MDN, uPlot GitHub)
- uPlot streaming: MEDIUM - no native append API confirmed, but the setData + slicing pattern is well-documented in demos. resetScales=false behavior needs runtime verification.

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days -- stable libraries, no expected breaking changes)
