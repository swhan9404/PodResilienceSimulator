# Technology Stack

**Project:** Slow Request Simulator (EKS Synchronous Worker Pod Latency Resistance)
**Researched:** 2026-04-11
**Overall Confidence:** HIGH (versions verified via npm registry)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 19.2.5 | UI framework | Component model for parameter panels, controls, result report. React 19 is stable with improved performance. The spec already mandates React. | HIGH |
| React DOM | 19.2.5 | DOM rendering | Matches React version | HIGH |
| TypeScript | 5.7.x | Type safety | Use ~5.7 (not 6.0.2 which just shipped). TS 6.0 is brand new and may have ecosystem compat issues with tooling. 5.7 is battle-tested. | HIGH |
| Vite | 8.0.8 | Build tool / dev server | Spec mandates Vite. v8 is current, fast HMR, native ESM. @tailwindcss/vite supports Vite 8. | HIGH |

**Note on TypeScript 6.0 vs 5.7:** TypeScript 6.0.2 just released. It introduces breaking changes (e.g., `--module nodenext` behavior changes). For a greenfield project starting now, 5.7.x is safer. Upgrade to 6.x after the ecosystem stabilizes (~2-3 months). If you want to live on the edge, 6.0 will work, but expect occasional tooling friction.

### State Management

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Zustand | 5.0.12 | UI state management | Lightweight (2KB), zero boilerplate, works outside React components. Perfect for this project: simulation config state lives in Zustand, simulation runtime state lives in plain classes. Zustand 5 supports React >=18 including React 19. | HIGH |

**What NOT to use for state:**
- **Redux/RTK** -- Overkill. This is a single-page tool, not a complex SPA with normalized entities.
- **Jotai/Recoil** -- Atomic state model adds complexity without benefit here. Configuration is a single cohesive object, not many independent atoms.
- **React Context** -- Fine for static values, bad for frequent updates (causes full subtree re-renders).
- **React refs for simulation state** -- YES, use refs/plain classes for the simulation engine internals. Zustand is only for UI-facing state (config, playback controls, snapshot data for rendering).

### Charting (Real-Time Metrics)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| uPlot | 1.6.32 | Real-time time-series charts | **545KB unpacked** vs Chart.js 6.2MB vs Recharts 6.8MB. Canvas-based rendering. Designed specifically for time-series with streaming data. Handles 100K+ data points without lag. No dependencies. This is the critical differentiator for 100x speed simulation with continuous chart updates. | HIGH |
| uplot-react | 1.2.4 | React wrapper for uPlot | Thin declarative wrapper. Peer deps: React >=16.8.6, uPlot ^1.6.32. Handles mount/update/destroy lifecycle. | MEDIUM |

**Why uPlot over alternatives:**

| Library | Unpacked Size | Rendering | Streaming Support | Verdict |
|---------|---------------|-----------|-------------------|---------|
| **uPlot** | 545KB | Canvas | Native (designed for it) | **Winner** -- built for exactly this use case |
| Chart.js | 6.2MB | Canvas | Plugin-based, not native | Too heavy, streaming is afterthought |
| Recharts | 6.8MB | SVG | Poor (SVG DOM thrashing) | SVG-based = death at high update rates |
| Lightweight Charts | 3.0MB | Canvas | Financial-focused (OHLC) | Designed for finance, wrong abstraction for line/area metrics |
| D3 | Large | SVG/Canvas | Manual | Way too low-level for this project's needs |

**uplot-react note:** The wrapper is thin (~100 lines). If it causes issues, writing a custom `useUPlot` hook is trivial. Do NOT skip the wrapper -- it handles cleanup and resize correctly.

### Canvas Visualization (Pod State)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Native Canvas 2D API | (browser built-in) | Pod state visualization | For 5-20 pods with workers, backlog bars, and probe indicators, the native Canvas 2D API is sufficient. No library needed. Adding a Canvas library (PixiJS, Konva) would be overengineering for this rendering complexity. | HIGH |

**Why NOT use a Canvas library:**
- **PixiJS** -- WebGL-based, designed for games/graphics with thousands of sprites. Our pod visualization is ~50-200 rectangles max. PixiJS adds 500KB+ and WebGL context overhead for no benefit.
- **Konva** -- Good for interactive Canvas apps (drag, click events on shapes). Our pod canvas is display-only, no interaction. Konva adds unnecessary abstraction.
- **Fabric.js** -- Object model for canvas manipulation. Wrong tool entirely.

**Implementation approach:** Write a `PodRenderer` class that takes a Canvas context and a simulation snapshot, draws everything imperatively. Use `requestAnimationFrame` for the render loop, independent of React's render cycle.

### Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | 4.2.2 | Utility-first CSS for layout panels | Fast layout for parameter panel, controls, result report. v4 uses CSS-first configuration (no tailwind.config.js), integrates via Vite plugin. | HIGH |
| @tailwindcss/vite | 4.2.2 | Vite integration | Official Tailwind v4 Vite plugin. Replaces PostCSS-based setup. Supports Vite 5-8. | HIGH |

**Tailwind v4 vs v3:** v4 is a major rewrite. CSS-based configuration replaces JS config. Import via `@import "tailwindcss"` in CSS. No `tailwind.config.js` needed. Simpler setup, same utility classes.

**What NOT to use:**
- **CSS Modules** -- Adds file proliferation for a project where Tailwind covers 95% of needs.
- **styled-components/Emotion** -- Runtime CSS-in-JS is dead in 2025. Performance overhead, hydration issues.
- **Vanilla Extract** -- Good but overkill. The UI panels are simple forms; Tailwind is faster to develop.

### Build & Dev Tools

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @vitejs/plugin-react | 6.0.1 | React Fast Refresh for Vite | Official Vite plugin for React. Enables HMR during development. | HIGH |
| ESLint | 10.2.0 | Linting | Flat config format (eslint.config.js). | MEDIUM |
| Vitest | 4.1.4 | Unit testing | Native Vite integration, same config/transforms. Test the simulation engine (pure TS logic) thoroughly. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| Immer | 11.1.4 | Immutable state updates | Only if Zustand state updates become complex (nested config objects). Zustand has built-in Immer middleware. Start without it; add if config manipulation gets painful. | MEDIUM |

**Libraries explicitly NOT needed:**

| Library | Why Not |
|---------|---------|
| React Router | Single page, no routing. One view with panels. |
| TanStack Query | No server, no data fetching. Pure client-side simulation. |
| Axios/ky | No HTTP calls. |
| Framer Motion | Animations are Canvas-based, not DOM-based. |
| date-fns/dayjs | Simulation time is just numbers (ms). No date formatting needed. |
| lodash | Modern JS covers everything needed. No utility library. |
| Web Workers | Tempting for simulation offloading, but adds complexity (message serialization, shared state). Start without. Only add if 100x speed causes frame drops -- which is unlikely since simulation is O(events) not O(n^2). |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | React 19 | Svelte 5 | Spec mandates React. Svelte would actually be excellent for this (less overhead), but not worth diverging from spec. |
| Charting | uPlot | Chart.js 4.5 | 12x larger, streaming not native. Chart.js is the "safe default" but wrong for real-time streaming at high update rates. |
| Charting | uPlot | Recharts 3.8 | SVG-based, will choke on 100x speed updates. Popular but wrong rendering technology. |
| State | Zustand 5 | Redux Toolkit | Overkill for a tool with ~10 state fields. RTK shines in large apps with complex normalized data. |
| State | Zustand 5 | Jotai | Atomic model adds unnecessary indirection. Config is one cohesive object. |
| Canvas | Native 2D | PixiJS | WebGL overhead for ~100 rectangles. Wrong tool. |
| Canvas | Native 2D | Konva | Interaction model we don't need. Display-only rendering. |
| CSS | Tailwind 4 | CSS Modules | More files, slower development for simple UI panels. |
| Testing | Vitest | Jest | Vitest shares Vite config, zero extra setup. Jest requires separate transform config. |
| TS | 5.7.x | 6.0.2 | TS 6 just shipped, ecosystem needs time to catch up. Conservative choice for stability. |

---

## Architecture Decision: Simulation Engine Outside React

This is the most important architectural choice in the stack.

**The simulation engine is a plain TypeScript class, NOT a React component or hook.**

```
SimulationEngine (pure TS)         React Layer
├── PriorityQueue<Event>           ├── useSimulation() hook
├── Pod[] (state machines)    ---> │   reads snapshots from engine
├── LoadBalancer                   │   passes to Canvas renderer
├── MetricsCollector               ├── PodCanvas (imperative Canvas)
├── clock: number                  ├── MetricsChart (uPlot)
└── step() / run() / pause()      └── ParameterPanel (Zustand)
```

**Why:** React's reconciliation cycle (even with `useSyncExternalStore`) adds latency. At 100x speed, the simulation processes thousands of events per frame. The engine must run in a tight loop outside React's scheduler. React only reads snapshots at 60fps via `requestAnimationFrame`.

**Zustand's role:** Store UI configuration (pod count, worker count, probe settings, speed). When user clicks "Start", the config is read once to initialize the engine. During simulation, Zustand is NOT in the hot path.

---

## Installation

```bash
# Create project
npm create vite@latest slow-request-simulator -- --template react-ts

# Core dependencies
npm install react@^19.2 react-dom@^19.2 zustand@^5.0 uplot@^1.6.32 uplot-react@^1.2.4

# Tailwind CSS v4
npm install tailwindcss@^4.2 @tailwindcss/vite@^4.2

# Dev dependencies
npm install -D typescript@~5.7 @types/react@^19.2 @types/react-dom@^19.2 @vitejs/plugin-react@^6.0 vitest@^4.1 eslint@^10.2
```

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: './', // For static deployment (GitHub Pages / S3)
})
```

### Tailwind CSS v4 Setup

```css
/* src/index.css */
@import "tailwindcss";
```

No `tailwind.config.js` needed in v4. Customization goes in CSS:

```css
@import "tailwindcss";

@theme {
  --color-pod-ready: #4CAF50;
  --color-pod-not-ready: #FFC107;
  --color-pod-restarting: #F44336;
}
```

---

## Version Verification Sources

All versions verified via `npm view <package> version` on 2026-04-11:

| Package | Verified Version | Method |
|---------|-----------------|--------|
| react | 19.2.5 | npm registry |
| react-dom | 19.2.5 | npm registry |
| typescript | 6.0.2 (recommending ~5.7) | npm registry |
| vite | 8.0.8 | npm registry |
| zustand | 5.0.12 | npm registry |
| tailwindcss | 4.2.2 | npm registry |
| @tailwindcss/vite | 4.2.2 | npm registry |
| uplot | 1.6.32 | npm registry |
| uplot-react | 1.2.4 | npm registry |
| @vitejs/plugin-react | 6.0.1 | npm registry |
| vitest | 4.1.4 | npm registry |
| eslint | 10.2.0 | npm registry |
| immer | 11.1.4 | npm registry |

---

## Key Stack Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| uPlot has smaller community than Chart.js | Low | Library is stable (v1.6.32), minimal API surface. If abandoned, the Canvas rendering it produces is standard -- migration to another Canvas chart lib is straightforward. |
| uplot-react wrapper may lag behind React 19 | Low | Wrapper is ~100 lines. If it breaks, write a custom hook (30min work). Peer dep is React >=16.8. |
| Tailwind v4 is relatively new | Low | Utility classes are the same. Migration from v3 would be trivial if needed. The Vite plugin is official and maintained. |
| TypeScript 5.7 is not the latest | Low | Intentional conservatism. Upgrade path to 6.x is straightforward when ready. |
| Canvas 2D performance at scale | Very Low | We're rendering 5-20 pods with a few shapes each. Canvas 2D can handle 10,000+ shapes at 60fps. Not a concern. |
