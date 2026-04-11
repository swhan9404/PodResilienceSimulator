# Phase 3: Controls & Parameters - Research

**Researched:** 2026-04-11
**Domain:** React UI controls, Zustand state management, form handling, simulation lifecycle
**Confidence:** HIGH

## Summary

Phase 3 introduces user-facing controls and parameter editing to replace the hardcoded `DEMO_CONFIG`. The core work is: (1) introduce a Zustand store that manages simulation config, playback state, and engine/loop references; (2) build a left sidebar panel with parameter forms organized by section (Cluster, Traffic, Request Profiles, Probes, Pod); (3) add lifecycle control buttons (Start/Pause/Resume/Reset/Stop Requests) with state-dependent visibility; (4) add a speed control with preset buttons and a log-scale slider; (5) display live status indicators (elapsed time, 503 count, ready pods).

The existing codebase provides all the engine and rendering infrastructure. `SimulationEngine` already exposes `stopRequests()`, and `SimulationLoop` already exposes `start()`, `stop()`, `setSpeed()`. The `useSimulation` hook currently auto-starts with `DEMO_CONFIG` -- this hook will be replaced by a Zustand store that holds the engine/loop refs and exposes actions. The key refactoring target is `useSimulation.ts`, which gets absorbed into the store + a thinner `useSimulationStore` hook pattern.

**Primary recommendation:** Use a single Zustand store with `create<T>()()` curried TypeScript pattern. Colocate config state, playback state, snapshot ref, and lifecycle actions in one store. Use individual property selectors for components to avoid unnecessary re-renders. Use `useShallow` only when destructuring multiple properties.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Parameters editable only before start -- all fields disabled during run, Reset button returns to edit mode
- **D-02:** Request profiles as inline list -- each profile shows name/latencyMs/ratio/color on one line, [+] to add, [x] to delete, inline editing
- **D-03:** Ratio auto-normalization -- users enter free ratios (e.g., 7:3), auto-normalized to 100% at simulation start
- **D-04:** Speed control: preset buttons (1x, 10x, 50x, 100x) + log-scale slider combo
- **D-05:** Speed adjustable only during run, disabled before start, default 1x. SimulationLoop.setSpeed() already implemented
- **D-06:** Status info at top of left panel -- elapsed sim time, current 503 count, ready pod count (CTL-04)
- **D-07:** Left panel fixed width 300px -- at 1280px min width, right visualization area gets 980px
- **D-08:** Control buttons show/hide by state:
  - Before start: [Start] only
  - Running: [Pause] [Stop Requests] [Reset] + Speed controls
  - Paused: [Resume] [Reset]
  - After stop requests: [Reset] + Speed controls (for observing recovery)
- **D-09:** Single Zustand store -- config (parameter settings) + playback (run state/speed) + snapshot ref in one store. Use selectors for targeted subscriptions
- **D-10:** Store holds SimulationEngine/SimulationLoop instance refs -- start/pause/reset actions operate engine directly from store. State and actions colocated

### Claude's Discretion
- Parameter form section folding/collapsing approach (Cluster, Traffic, Probes, etc.)
- Color picker UI (color picker vs preset palette)
- Default values (DEMO_CONFIG values as initial values)
- Left panel internal scrolling (when many parameters)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTL-01 | Start/pause/resume simulation | Zustand store actions wrapping SimulationLoop.start()/stop(); D-08 state-based button visibility |
| CTL-02 | Speed control 0.5x-100x | Log-scale slider + preset buttons (D-04); SimulationLoop.setSpeed() already exists |
| CTL-03 | "Stop Requests" button sets RPS to 0 for recovery measurement | SimulationEngine.stopRequests() already exists; button in running state per D-08 |
| CTL-04 | Always-visible elapsed time, 503 count, ready pod count | Status display at panel top (D-06); data from SimulationSnapshot.clock/stats |
| PAR-01 | Cluster settings input (podCount, workersPerPod, maxBacklogPerPod) | Form fields mapping to SimulationConfig type; disabled during run (D-01) |
| PAR-02 | Traffic settings input (rps) | Single number input; disabled during run (D-01) |
| PAR-03 | Request profile list add/delete/edit (name, latencyMs, ratio, color) | Inline list per D-02; auto-normalization per D-03 |
| PAR-04 | Liveness probe settings (periodSeconds, timeoutSeconds, failureThreshold, successThreshold) | Form section mapping to ProbeConfig type |
| PAR-05 | Readiness probe settings (same fields as PAR-04) | Same form pattern as PAR-04, separate config |
| PAR-06 | Pod settings input (initializeTime) | Single number input mapping to initializeTimeMs |
</phase_requirements>

## Standard Stack

### Core (New for Phase 3)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.0.12 | UI + simulation state management | Already decided in CLAUDE.md. Lightweight (2KB), works outside React components, perfect for holding engine refs + UI config. React 19 compatible. [VERIFIED: npm registry] |

### Already Installed (No Changes)
| Library | Version | Purpose |
|---------|---------|---------|
| React | ^19.2.4 | UI framework |
| Tailwind CSS | ^4.2.2 | Styling |
| uPlot | ^1.6.32 | Charts (Phase 2) |
| Vitest | ^4.1.4 | Testing |

### Not Needed
| Library | Why Not |
|---------|---------|
| react-hook-form | Forms are simple (15 fields total). Native controlled inputs + Zustand are sufficient. RHF adds 30KB for no benefit. [ASSUMED] |
| formik | Same reasoning as RHF. Overkill for this form complexity. |
| Color picker library | Preset palette of 6-8 hex colors is simpler and sufficient for request profile colors. Full picker is unnecessary for this use case. |
| Immer | Config updates are shallow object spreads. No deeply nested mutations needed. Start without; add only if needed. |

**Installation:**
```bash
npm install zustand
```

## Architecture Patterns

### Recommended Component Structure
```
src/
  store/
    useSimulationStore.ts    # Single Zustand store (config + playback + actions)
  components/
    ControlPanel.tsx          # Left panel container (300px fixed)
    StatusDisplay.tsx          # Elapsed time, 503 count, ready pods (CTL-04)
    PlaybackControls.tsx       # Start/Pause/Resume/Reset/Stop Requests buttons
    SpeedControl.tsx           # Preset buttons + log slider (CTL-02)
    ParamSection.tsx           # Reusable collapsible section wrapper
    ClusterParams.tsx          # PAR-01 form fields
    TrafficParams.tsx          # PAR-02 form fields
    RequestProfileList.tsx     # PAR-03 inline list with add/delete
    ProbeParams.tsx            # Reusable for PAR-04 and PAR-05
    PodParams.tsx              # PAR-06 form fields
  visualization/
    (existing files unchanged)
  simulation/
    (existing files unchanged)
```

### Pattern 1: Zustand Store with Engine Refs (D-09, D-10)

**What:** A single Zustand store holding config state, playback state, and engine/loop instance refs. Actions in the store directly manipulate engine instances.

**When to use:** This is the only store pattern for this project. One store, selective subscriptions.

**Example:**
```typescript
// Source: Zustand v5 official README + D-09/D-10 decisions
import { create } from 'zustand';
import type { SimulationConfig } from '../simulation/types';

type PlaybackState = 'idle' | 'running' | 'paused' | 'stopped_requests';

interface SimulationStore {
  // Config state (editable before start)
  config: SimulationConfig;
  updateConfig: (partial: Partial<SimulationConfig>) => void;

  // Playback state
  playback: PlaybackState;
  speed: number;

  // Live status (updated every rAF frame via ref, not via set())
  // NOTE: clock/stats are read from snapshot ref, not stored in Zustand
  // to avoid 60fps set() calls

  // Engine refs (not serializable, not reactive)
  engineRef: SimulationEngine | null;
  loopRef: SimulationLoop | null;

  // Actions
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  stopRequests: () => void;
  setSpeed: (speed: number) => void;
}

const useSimulationStore = create<SimulationStore>()((set, get) => ({
  config: DEFAULT_CONFIG,
  updateConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

  playback: 'idle',
  speed: 1,

  engineRef: null,
  loopRef: null,

  start: () => {
    const { config } = get();
    const normalizedConfig = normalizeRatios(config);
    const engine = new SimulationEngine(normalizedConfig);
    // ... create loop, wire callbacks
    set({ engineRef: engine, loopRef: loop, playback: 'running' });
    loop.start();
  },

  pause: () => {
    get().loopRef?.stop();
    set({ playback: 'paused' });
  },

  resume: () => {
    get().loopRef?.start();
    set({ playback: 'running' });
  },

  reset: () => {
    get().loopRef?.stop();
    set({ engineRef: null, loopRef: null, playback: 'idle', speed: 1 });
  },

  stopRequests: () => {
    get().engineRef?.stopRequests();
    set({ playback: 'stopped_requests' });
  },

  setSpeed: (speed) => {
    get().loopRef?.setSpeed(speed);
    set({ speed });
  },
}));
```

[VERIFIED: Zustand v5 curried create<T>()() pattern from official GitHub README]

### Pattern 2: Snapshot via Ref, Not Zustand State

**What:** The simulation snapshot (clock, stats, pods) updates at 60fps via rAF. Storing this in Zustand would trigger 60 set() calls per second, causing unnecessary re-renders. Instead, use a React ref that the rAF loop writes to, and have components that need live data use `requestAnimationFrame` or a separate subscription.

**When to use:** For the status display (CTL-04) which needs live clock/503/readyPod values.

**Key insight:** The existing pattern already uses `useState` for chart data via callback. For the status display, either:
- (A) Add a `snapshotRef` to the store and have the status component read from it via its own rAF loop (most performant)
- (B) Throttle snapshot updates to Zustand at ~4-10Hz for the status display (simpler, acceptable perf)

**Recommendation:** Option B -- update Zustand status state at a throttled rate (e.g., every 250ms) from the loop callback. Three numbers updating 4 times/second is cheap. This keeps the status display reactive without manual rAF in every consumer.

```typescript
// In the store
statusClock: 0,
status503: 0,
statusReadyPods: 0,

// In the loop callback (throttled to ~4Hz)
let lastStatusUpdate = 0;
const STATUS_THROTTLE_MS = 250;

// inside tick or onChartUpdate callback:
if (now - lastStatusUpdate > STATUS_THROTTLE_MS) {
  lastStatusUpdate = now;
  const snapshot = engine.getSnapshot();
  store.setState({
    statusClock: snapshot.clock,
    status503: snapshot.stats.total503s,
    statusReadyPods: snapshot.stats.readyPodCount,
  });
}
```

[ASSUMED -- throttled status update approach; multiple valid strategies exist]

### Pattern 3: Log-Scale Slider for Speed Control (D-04)

**What:** Map a linear slider (0-100 range) to exponential speed values (0.5x-100x) using logarithmic scaling.

**When to use:** Speed control slider per D-04.

**Example:**
```typescript
// Linear position (0-100) <-> exponential speed (0.5-100)
const MIN_SPEED = 0.5;
const MAX_SPEED = 100;

function sliderToSpeed(position: number): number {
  // position: 0..100 -> speed: 0.5..100 (log scale)
  const minLog = Math.log(MIN_SPEED);
  const maxLog = Math.log(MAX_SPEED);
  const speed = Math.exp(minLog + (position / 100) * (maxLog - minLog));
  return Math.round(speed * 10) / 10; // 1 decimal
}

function speedToSlider(speed: number): number {
  const minLog = Math.log(MIN_SPEED);
  const maxLog = Math.log(MAX_SPEED);
  return ((Math.log(speed) - minLog) / (maxLog - minLog)) * 100;
}
```

[VERIFIED: standard logarithmic mapping formula]

### Pattern 4: Ratio Auto-Normalization (D-03)

**What:** Users enter any numeric ratios (e.g., 7, 3). At simulation start, normalize so all ratios sum to 1.0.

**Example:**
```typescript
function normalizeRatios(config: SimulationConfig): SimulationConfig {
  const profiles = config.requestProfiles;
  const total = profiles.reduce((sum, p) => sum + p.ratio, 0);
  if (total === 0) return config;
  return {
    ...config,
    requestProfiles: profiles.map(p => ({
      ...p,
      ratio: p.ratio / total,
    })),
  };
}
```

[VERIFIED: simple normalization, no library needed]

### Pattern 5: Controlled Input with Number Validation

**What:** Each parameter input is a controlled component bound to Zustand config state. Validation is minimal (positive numbers, integers where appropriate).

**Example:**
```typescript
function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        step={step}
        disabled={disabled}
        className="w-20 px-2 py-1 rounded border border-[var(--border-color)]
                   bg-[var(--bg-dominant)] text-[var(--text-primary)] text-right
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </label>
  );
}
```

[ASSUMED -- standard React controlled input pattern]

### Anti-Patterns to Avoid

- **Storing snapshot in Zustand at 60fps:** Never `set({ snapshot })` every frame. Use ref for high-frequency data, throttled Zustand updates for UI-visible status.
- **useShallow everywhere:** Only use `useShallow` when destructuring multiple properties from the store. Individual property selectors (`(s) => s.speed`) do not need it.
- **Creating new engine on speed change:** Speed changes should call `loopRef.setSpeed()` directly, not recreate the engine/loop.
- **Re-rendering entire panel on status update:** Use separate selectors for status vs config vs playback to isolate re-renders.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State management | Custom pub-sub or Context | Zustand 5 | Zustand handles React 19 concurrent mode, selector equality, and outside-React access |
| Form validation library | Custom validation framework | Simple inline checks | Only 15 fields, all numeric. Validation is: positive number, integer where needed. No complex rules. |
| Color picker | Full HSL/RGB picker component | Preset hex palette (6-8 colors) | Request profile colors serve as chart/canvas identifiers. Users don't need arbitrary color selection. A row of colored circles is sufficient. |
| Speed slider math | Trial-and-error linear mapping | Logarithmic scale formula | Log scale is the standard for exponential ranges. The formula above is well-known. |

**Key insight:** This phase is predominantly UI layout and wiring. The complex engine/rendering logic already exists. Don't overcomplicate the forms.

## Common Pitfalls

### Pitfall 1: Zustand v5 `useShallow` Infinite Loop
**What goes wrong:** Selecting multiple state values as an object without `useShallow` causes infinite re-render loop in Zustand v5, crashing the component.
**Why it happens:** Zustand v5 uses `useSyncExternalStore` with strict reference equality. A selector returning `{ a: s.a, b: s.b }` creates a new object reference every time, triggering re-render, which calls the selector again.
**How to avoid:** Use individual selectors `(s) => s.a` for single values. Use `useShallow` from `'zustand/react/shallow'` when destructuring multiple values.
**Warning signs:** "Maximum update depth exceeded" error from React.
[VERIFIED: Zustand v5 migration docs on GitHub]

### Pitfall 2: Engine/Loop Memory Leak on Reset
**What goes wrong:** Resetting the simulation without properly stopping the rAF loop and clearing refs leaves orphaned animation frames running.
**Why it happens:** `reset()` must call `loopRef.stop()` before setting refs to null. If the loop is still running when refs are cleared, the rAF callback continues but operates on stale references.
**How to avoid:** Always stop the loop before clearing engine/loop refs. The `SimulationLoop.stop()` already calls `cancelAnimationFrame()`.
**Warning signs:** Multiple simulations running simultaneously after reset, increasing CPU usage.
[VERIFIED: existing SimulationLoop.stop() implementation in codebase]

### Pitfall 3: Number Input Returns String
**What goes wrong:** `<input type="number">` `onChange` gives `e.target.value` as a string. Direct assignment to a `number` field silently stores `"5"` instead of `5`.
**Why it happens:** DOM input values are always strings.
**How to avoid:** Always use `Number(e.target.value)` or `parseFloat(e.target.value)`. Handle `NaN` case (empty input).
**Warning signs:** TypeScript won't catch this at compile time if the handler uses `any`.
[VERIFIED: standard DOM behavior]

### Pitfall 4: Chart Manager ProfileNames Mismatch
**What goes wrong:** If a user changes request profile names/count and starts a new simulation, the `MetricsChartManager` and `MetricsCharts` component need to be recreated with the new profile names and colors.
**Why it happens:** `MetricsChartManager` is initialized with profile names in its constructor. Changing profiles requires a new instance.
**How to avoid:** On `start()`, always create fresh `MetricsChartManager` with the current config's profile names. Pass updated `profileNames` and `profileColors` to `MetricsCharts`.
**Warning signs:** Chart labels showing old profile names, or response time chart missing series.
[VERIFIED: existing MetricsChartManager constructor in codebase]

### Pitfall 5: useSimulation Hook Refactoring Breakage
**What goes wrong:** The existing `useSimulation` hook manages engine creation, loop creation, PodRenderer wiring, dark mode detection, and chart data state. Refactoring to Zustand must preserve all of these responsibilities.
**Why it happens:** `useSimulation` currently does 5 things. If any is missed during refactoring, rendering breaks silently (no error, just blank canvas or frozen charts).
**How to avoid:** Enumerate every responsibility of `useSimulation` before refactoring. The store must handle: engine creation, loop creation, PodRenderer connection, canvas dimension updates, dark mode detection, chart data callbacks.
**Warning signs:** Canvas blank, charts not updating, dark mode not detected.
[VERIFIED: existing useSimulation.ts implementation in codebase]

## Code Examples

### Zustand Store Creation (Full Pattern)
```typescript
// Source: Zustand v5 GitHub README + project-specific adaptation
import { create } from 'zustand';

interface SimulationStore {
  config: SimulationConfig;
  playback: 'idle' | 'running' | 'paused' | 'stopped_requests';
  speed: number;
  // ... actions
}

const useSimulationStore = create<SimulationStore>()((set, get) => ({
  // state + actions colocated
}));

// Component usage - individual selectors (no useShallow needed)
const playback = useSimulationStore((s) => s.playback);
const speed = useSimulationStore((s) => s.speed);

// Component usage - multiple values (useShallow required)
import { useShallow } from 'zustand/react/shallow';
const { config, updateConfig } = useSimulationStore(
  useShallow((s) => ({ config: s.config, updateConfig: s.updateConfig }))
);
```
[VERIFIED: Zustand v5 official GitHub README]

### State-Dependent Button Rendering (D-08)
```typescript
// Source: D-08 decision
function PlaybackControls() {
  const playback = useSimulationStore((s) => s.playback);
  const start = useSimulationStore((s) => s.start);
  const pause = useSimulationStore((s) => s.pause);
  const resume = useSimulationStore((s) => s.resume);
  const reset = useSimulationStore((s) => s.reset);
  const stopRequests = useSimulationStore((s) => s.stopRequests);

  return (
    <div className="flex gap-2">
      {playback === 'idle' && (
        <button onClick={start}>Start</button>
      )}
      {playback === 'running' && (
        <>
          <button onClick={pause}>Pause</button>
          <button onClick={stopRequests}>Stop Requests</button>
          <button onClick={reset}>Reset</button>
        </>
      )}
      {playback === 'paused' && (
        <>
          <button onClick={resume}>Resume</button>
          <button onClick={reset}>Reset</button>
        </>
      )}
      {playback === 'stopped_requests' && (
        <button onClick={reset}>Reset</button>
      )}
    </div>
  );
}
```
[ASSUMED -- standard conditional rendering pattern]

### Color Preset Palette (Claude's Discretion)
```typescript
// Preset palette for request profile colors
const COLOR_PRESETS = [
  '#3B82F6', // blue
  '#F97316', // orange
  '#EF4444', // red
  '#22C55E', // green
  '#A855F7', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F59E0B', // amber
];

function ColorPicker({ value, onChange, disabled }: {
  value: string; onChange: (c: string) => void; disabled: boolean;
}) {
  return (
    <div className="flex gap-1">
      {COLOR_PRESETS.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          disabled={disabled}
          className={`w-5 h-5 rounded-full border-2 ${
            value === color ? 'border-white ring-2 ring-blue-500' : 'border-transparent'
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
```
[ASSUMED -- discretion area, simple preset approach]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useSimulation` hook with local state + refs | Zustand store with engine refs + actions | Phase 3 | Centralizes all simulation lifecycle control in one place |
| `DEMO_CONFIG` hardcoded | User-editable config in Zustand store | Phase 3 | Users can configure all parameters before start |
| Auto-start simulation on mount | Explicit start via button press | Phase 3 | Users control when simulation begins |
| Full-width visualization | Left panel (300px) + right visualization (remaining) | Phase 3 | Adds parameter editing and control UI |

**Key migration:** `useSimulation.ts` is the primary refactoring target. Its responsibilities (engine creation, loop wiring, chart callbacks, canvas connection) move into the Zustand store's `start()` action and supporting hooks.

## Assumptions Log

> List all claims tagged [ASSUMED] in this research. The planner and discuss-phase use this
> section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | react-hook-form is unnecessary for 15 fields | Standard Stack / Not Needed | If forms grow complex, would need to add later. Low risk -- forms are simple numeric inputs. |
| A2 | Throttled status update at ~4Hz is sufficient for CTL-04 | Architecture Patterns / Pattern 2 | Status display might feel laggy at high speeds. Could increase to 10Hz if needed. Minimal impact. |
| A3 | Standard controlled input pattern is sufficient | Architecture Patterns / Pattern 5 | If validation needs grow, may need a form library. Low risk for current scope. |
| A4 | Conditional rendering pattern for D-08 | Code Examples | Standard React pattern, very low risk. |
| A5 | Preset color palette is sufficient for color selection | Code Examples / Claude's Discretion | Users might want custom colors. Preset palette covers the common case; custom hex input could be added later. |

## Open Questions

1. **Seed parameter visibility**
   - What we know: `SimulationConfig` has a `seed: number` field for PRNG determinism. DEMO_CONFIG uses `seed: 42`.
   - What's unclear: Should the seed be exposed in the parameter panel, or auto-generated?
   - Recommendation: Include a seed field in the form with default 42. This enables reproducible simulations without complicating the UI.

2. **SimulationLoop pause vs stop semantics**
   - What we know: `SimulationLoop` has `start()` and `stop()`. There is no explicit `pause()` method -- `stop()` cancels the rAF loop.
   - What's unclear: Should pause/resume use existing start/stop, or add a dedicated pause mechanism?
   - Recommendation: Use `stop()` for pause and `start()` for resume. The loop already resumes from where it left off because the engine clock is preserved. The rAF loop picks up `lastTimestamp = performance.now()` on next start, and `engine.step()` will process from the current engine clock.

3. **Chart data clearing on Reset**
   - What we know: Chart data (uPlot `AlignedData`) is stored in component state. On reset, the simulation starts fresh.
   - What's unclear: Does uPlot handle data being reset to empty arrays cleanly?
   - Recommendation: Reset chart data to `EMPTY_DATA` in the store, which is the same pattern used for initial state. uplot-react should handle the transition.

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: React 19 + TypeScript 5.7 + Vite 8 + Zustand 5 + Tailwind CSS 4
- **No external form libraries**: Keep forms simple with native inputs + Zustand
- **No extra animation libraries**: All animation is Canvas-based (Phase 2)
- **Simplicity First**: Minimum code that solves the problem. No speculative features.
- **Surgical Changes**: Touch only what is needed. Match existing style.
- **Desktop only**: 1280px minimum width
- **Simulation engine outside React**: Engine/Loop are plain TS classes, not React components

## Sources

### Primary (HIGH confidence)
- [Zustand GitHub README](https://github.com/pmndrs/zustand) - v5 store creation patterns, TypeScript curried syntax, useShallow
- [Zustand npm registry](https://www.npmjs.com/package/zustand) - version 5.0.12 confirmed, peer deps (React >=18)
- [Zustand v5 migration guide](https://github.com/pmndrs/zustand/blob/main/docs/migrations/migrating-to-v5.md) - useShallow import paths, breaking changes
- Existing codebase: `useSimulation.ts`, `SimulationLoop.ts`, `engine.ts`, `demoConfig.ts`, `App.tsx`, `types.ts` - current implementation patterns

### Secondary (MEDIUM confidence)
- [Zustand TypeScript Guide](https://sanjewa.com/blogs/zustand-typescript-type-safe-state-management/) - TypeScript patterns verified against official README
- [Zustand v5 selectors discussion](https://github.com/pmndrs/zustand/discussions/2867) - useShallow best practices

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zustand 5.0.12 verified on npm, peer deps confirmed compatible with project's React 19
- Architecture: HIGH - Store pattern is well-documented, existing engine API is stable and understood
- Pitfalls: HIGH - All pitfalls verified against existing codebase or official Zustand docs
- UI patterns: MEDIUM - Color picker and form layout are discretion areas, multiple valid approaches

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- Zustand 5 is mature, project stack is locked)
