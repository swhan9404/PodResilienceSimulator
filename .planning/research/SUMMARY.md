# Research Summary: Slow Request Simulator

**Domain:** Browser-based discrete event simulation for EKS synchronous worker pod failure modeling
**Researched:** 2026-04-11
**Overall confidence:** HIGH (versions verified via npm registry, architecture based on mature patterns)

## Executive Summary

This project is a browser-based discrete event simulator that models how synchronous worker pods in EKS degrade under slow request load. The technology choices are constrained well by the spec: React + TypeScript + Vite + Canvas. The main research questions were around charting libraries, state management boundaries, current library versions, and ensuring the stack can handle 100x speed simulation without frame drops.

The stack is straightforward and verified: React 19.2.5 + TypeScript 5.7.x + Vite 8.0.8 for the shell, Zustand 5.0.12 for UI state, uPlot 1.6.32 for real-time metrics charts, native Canvas 2D for pod visualization, and Tailwind CSS 4.2.2 for layout. No backend, no Web Workers, no complex state management needed.

The most critical architectural decision is keeping the simulation engine as a pure TypeScript class completely outside React's render cycle. At 100x speed, the engine processes thousands of events per frame. React only reads snapshots at display frame rate (60fps for Canvas, throttled to ~20Hz for React state). This separation is non-negotiable for performance.

The charting library selection was the most impactful research decision. uPlot at 545KB unpacked is 12x smaller than Chart.js (6.2MB) and purpose-built for streaming time-series data with Canvas rendering. At 100x simulation speed, the charts will receive thousands of data points per second -- uPlot handles this natively, while SVG-based alternatives (Recharts) would choke and heavier Canvas libraries carry unnecessary weight.

## Key Findings

**Stack:** React 19.2.5 + TypeScript 5.7.x + Vite 8.0.8 + Zustand 5.0.12 + uPlot 1.6.32 + native Canvas 2D + Tailwind CSS 4.2.2. All versions verified via npm registry.
**Architecture:** Pure DES engine (event queue + state machines) producing snapshots consumed by Canvas renderer and React UI. Strict separation of simulation from rendering.
**Critical pitfall:** Coupling simulation state to React's render cycle or using fixed time-step simulation -- either makes 100x speed impossible.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: Simulation Engine** - Build and test the DES core headlessly
   - Addresses: Event queue, Pod state machine, worker model, load balancer, probe logic, metrics collection
   - Avoids: Coupling simulation to UI early; ensures correctness before visualization
   - Dependencies: None (pure TypeScript, highly testable)

2. **Visualization: Canvas + Charts** - Build rendering layer on top of engine snapshots
   - Addresses: Pod grid visualization, worker bars, backlog indicators, probe status, time-series charts via uPlot
   - Avoids: React re-render performance issues by keeping Canvas imperative
   - Dependencies: Engine must produce stable snapshot format

3. **React Integration: Controls + Parameters** - Wire UI controls to engine
   - Addresses: Parameter panel, start/pause/speed/stop-requests controls, simulation lifecycle hook
   - Avoids: Over-engineering state management
   - Dependencies: Engine + renderers must be functional

4. **Polish: Reporting + UX** - Result report, edge cases, responsive layout
   - Addresses: Post-simulation report, recovery time measurement, UX refinements
   - Avoids: Premature optimization
   - Dependencies: Full pipeline must work end-to-end

**Phase ordering rationale:**
- Engine first because it is the foundation with zero dependencies and can be thoroughly unit-tested with Vitest
- Canvas rendering second because it depends on the snapshot format from the engine, and validates engine output visually
- React integration third because it is thin glue between engine and UI
- Polish last because it requires the full pipeline to be working

**Research flags for phases:**
- Phase 1: Standard DES patterns, unlikely to need additional research
- Phase 2: uPlot streaming data API may need a brief spike to verify append-without-full-redraw capability
- Phase 3: Standard React + Zustand patterns, no research needed
- Phase 4: Standard, no research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry on 2026-04-11 |
| Features | HIGH | Spec is detailed and unambiguous; feature landscape is clear |
| Architecture | HIGH | DES is a textbook pattern; browser rendering integration is well-understood |
| Pitfalls | HIGH | Common mistakes in DES + Canvas + React domain are well-documented |
| Chart Library | HIGH | uPlot version confirmed, bundle size comparison verified empirically |

## Gaps to Address

- uPlot streaming data API specifics (how to append data without full redraw) -- verify during Phase 2 implementation
- TypeScript 5.7 exact patch version -- use latest 5.7.x at project creation time
- Canvas accessibility (screen reader support for pod states) -- not researched, may be needed for production use
- Whether `requestAnimationFrame` throttling at 100x speed needs manual frame skipping -- test during Phase 1
