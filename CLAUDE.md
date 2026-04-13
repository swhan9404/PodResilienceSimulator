<!-- GSD:project-start source:PROJECT.md -->
## Project

**Pod Resilience Simulator**

EKS 환경에서 동기(synchronous) worker 기반 Pod들이 느린 요청(slow request)에 의해 어떻게 무너지고 복구되는지를 시뮬레이션하는 웹 기반 도구. 브라우저에서 이산 이벤트 시뮬레이션을 실행하며 배속 조절로 cascading failure 과정을 시각적으로 확인할 수 있다.

**Core Value:** Pod/Worker 분배, backlog 크기, probe 설정에 따른 cascading failure 발생과 복구 과정을 시각적으로 확인하고, 서비스의 지연 저항성을 측정할 수 있다.

### Constraints

- **Tech Stack**: React 18 + TypeScript + Vite + Canvas — 브라우저 전용 SPA
- **Performance**: 배속 최대 100x에서도 부드러운 시각화 필요 — 시뮬레이션/렌더링 분리 필수
- **No Server**: 정적 SPA로 배포 가능해야 함 (GitHub Pages / S3 / 로컬)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 19.2.5 | UI framework | Component model for parameter panels, controls, result report. React 19 is stable with improved performance. The spec already mandates React. | HIGH |
| React DOM | 19.2.5 | DOM rendering | Matches React version | HIGH |
| TypeScript | 5.7.x | Type safety | Use ~5.7 (not 6.0.2 which just shipped). TS 6.0 is brand new and may have ecosystem compat issues with tooling. 5.7 is battle-tested. | HIGH |
| Vite | 8.0.8 | Build tool / dev server | Spec mandates Vite. v8 is current, fast HMR, native ESM. @tailwindcss/vite supports Vite 8. | HIGH |
### State Management
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Zustand | 5.0.12 | UI state management | Lightweight (2KB), zero boilerplate, works outside React components. Perfect for this project: simulation config state lives in Zustand, simulation runtime state lives in plain classes. Zustand 5 supports React >=18 including React 19. | HIGH |
- **Redux/RTK** -- Overkill. This is a single-page tool, not a complex SPA with normalized entities.
- **Jotai/Recoil** -- Atomic state model adds complexity without benefit here. Configuration is a single cohesive object, not many independent atoms.
- **React Context** -- Fine for static values, bad for frequent updates (causes full subtree re-renders).
- **React refs for simulation state** -- YES, use refs/plain classes for the simulation engine internals. Zustand is only for UI-facing state (config, playback controls, snapshot data for rendering).
### Charting (Real-Time Metrics)
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| uPlot | 1.6.32 | Real-time time-series charts | **545KB unpacked** vs Chart.js 6.2MB vs Recharts 6.8MB. Canvas-based rendering. Designed specifically for time-series with streaming data. Handles 100K+ data points without lag. No dependencies. This is the critical differentiator for 100x speed simulation with continuous chart updates. | HIGH |
| uplot-react | 1.2.4 | React wrapper for uPlot | Thin declarative wrapper. Peer deps: React >=16.8.6, uPlot ^1.6.32. Handles mount/update/destroy lifecycle. | MEDIUM |
| Library | Unpacked Size | Rendering | Streaming Support | Verdict |
|---------|---------------|-----------|-------------------|---------|
| **uPlot** | 545KB | Canvas | Native (designed for it) | **Winner** -- built for exactly this use case |
| Chart.js | 6.2MB | Canvas | Plugin-based, not native | Too heavy, streaming is afterthought |
| Recharts | 6.8MB | SVG | Poor (SVG DOM thrashing) | SVG-based = death at high update rates |
| Lightweight Charts | 3.0MB | Canvas | Financial-focused (OHLC) | Designed for finance, wrong abstraction for line/area metrics |
| D3 | Large | SVG/Canvas | Manual | Way too low-level for this project's needs |
### Canvas Visualization (Pod State)
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Native Canvas 2D API | (browser built-in) | Pod state visualization | For 5-20 pods with workers, backlog bars, and probe indicators, the native Canvas 2D API is sufficient. No library needed. Adding a Canvas library (PixiJS, Konva) would be overengineering for this rendering complexity. | HIGH |
- **PixiJS** -- WebGL-based, designed for games/graphics with thousands of sprites. Our pod visualization is ~50-200 rectangles max. PixiJS adds 500KB+ and WebGL context overhead for no benefit.
- **Konva** -- Good for interactive Canvas apps (drag, click events on shapes). Our pod canvas is display-only, no interaction. Konva adds unnecessary abstraction.
- **Fabric.js** -- Object model for canvas manipulation. Wrong tool entirely.
### Styling
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | 4.2.2 | Utility-first CSS for layout panels | Fast layout for parameter panel, controls, result report. v4 uses CSS-first configuration (no tailwind.config.js), integrates via Vite plugin. | HIGH |
| @tailwindcss/vite | 4.2.2 | Vite integration | Official Tailwind v4 Vite plugin. Replaces PostCSS-based setup. Supports Vite 5-8. | HIGH |
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
| Library | Why Not |
|---------|---------|
| React Router | Single page, no routing. One view with panels. |
| TanStack Query | No server, no data fetching. Pure client-side simulation. |
| Axios/ky | No HTTP calls. |
| Framer Motion | Animations are Canvas-based, not DOM-based. |
| date-fns/dayjs | Simulation time is just numbers (ms). No date formatting needed. |
| lodash | Modern JS covers everything needed. No utility library. |
| Web Workers | Tempting for simulation offloading, but adds complexity (message serialization, shared state). Start without. Only add if 100x speed causes frame drops -- which is unlikely since simulation is O(events) not O(n^2). |
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
## Architecture Decision: Simulation Engine Outside React
## Installation
# Create project
# Core dependencies
# Tailwind CSS v4
# Dev dependencies
### Vite Configuration
### Tailwind CSS v4 Setup
## Version Verification Sources
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
## Key Stack Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| uPlot has smaller community than Chart.js | Low | Library is stable (v1.6.32), minimal API surface. If abandoned, the Canvas rendering it produces is standard -- migration to another Canvas chart lib is straightforward. |
| uplot-react wrapper may lag behind React 19 | Low | Wrapper is ~100 lines. If it breaks, write a custom hook (30min work). Peer dep is React >=16.8. |
| Tailwind v4 is relatively new | Low | Utility classes are the same. Migration from v3 would be trivial if needed. The Vite plugin is official and maintained. |
| TypeScript 5.7 is not the latest | Low | Intentional conservatism. Upgrade path to 6.x is straightforward when ready. |
| Canvas 2D performance at scale | Very Low | We're rendering 5-20 pods with a few shapes each. Canvas 2D can handle 10,000+ shapes at 60fps. Not a concern. |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
