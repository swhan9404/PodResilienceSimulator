# Roadmap: Slow Request Simulator

## Overview

Build a browser-based discrete event simulator that models cascading failure in EKS synchronous worker pods. The build order follows dependency flow: first the headless simulation engine (pure TypeScript, fully testable), then the Canvas/chart visualization layer that consumes engine snapshots, then React controls that wire UI to the engine, and finally the post-simulation report. Each phase delivers a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Simulation Engine** - Headless DES core with pod state machines, health checks, load balancer, and metrics collection
- [ ] **Phase 2: Visualization** - Canvas pod grid and uPlot time-series charts rendering engine snapshots
- [ ] **Phase 3: Controls & Parameters** - React UI for simulation lifecycle, speed control, and parameter configuration
- [ ] **Phase 4: Report** - Post-simulation report with critical event timestamps, recovery metrics, and summary stats

## Phase Details

### Phase 1: Simulation Engine
**Goal**: A headless simulation engine that correctly models pod degradation under slow request load, verifiable through unit tests without any UI
**Depends on**: Nothing (first phase)
**Requirements**: SIM-01, SIM-02, SIM-03, SIM-04, POD-01, POD-02, POD-03, POD-04, POD-05, POD-06, HC-01, HC-02, HC-03, HC-04, HC-05, HC-06, HC-07, HC-08, LB-01, LB-02, LB-03
**Success Criteria** (what must be TRUE):
  1. Running the engine with 100% slow requests causes all pods to cascade into RESTARTING state within bounded time (verifiable via test)
  2. Running the engine with 0% slow requests keeps all pods READY indefinitely (verifiable via test)
  3. Health check probes consume worker slots and trigger pod restart/LB-removal when thresholds are exceeded (verifiable via test)
  4. Load balancer distributes requests only to READY pods and returns 503 when none are available (verifiable via test)
  5. Engine produces a snapshot object containing all pod states, worker occupancy, backlog levels, and cumulative metrics at any simulation tick
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffold + types + priority queue + RNG
- [x] 01-02-PLAN.md — Pod state machine + Load Balancer
- [x] 01-03-PLAN.md — MetricsCollector + SimulationEngine + integration tests

### Phase 2: Visualization
**Goal**: Users can watch the simulation unfold visually -- pod states rendered on Canvas and metrics plotted as time-series charts in real time
**Depends on**: Phase 1
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, MET-01, MET-02, MET-03, MET-04
**Success Criteria** (what must be TRUE):
  1. Each pod is rendered on Canvas showing worker slots (colored by request profile when busy, empty when idle), backlog fill level, and pod state border color (green/yellow/red)
  2. Probe results are visible per pod as a row of check/cross marks for recent probe outcomes
  3. Four time-series charts update in real time: worker usage, ready pod count, 503 rate, and per-profile response time
  4. Visualization remains smooth (no frame drops) at 100x simulation speed
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Deps + Tailwind/uPlot setup + PodRenderer + PodCanvas
- [x] 02-02-PLAN.md — MetricsChartManager + MetricsCharts (4 uPlot charts)
- [x] 02-03-PLAN.md — SimulationLoop + useSimulation hook + App.tsx integration
- [x] 02-04-PLAN.md — Gap closure: fix Phase 1 TS errors blocking npm run build

### Phase 3: Controls & Parameters
**Goal**: Users can configure all simulation parameters and control the simulation lifecycle (start, pause, speed, stop requests) through a React UI
**Depends on**: Phase 2
**Requirements**: CTL-01, CTL-02, CTL-03, CTL-04, PAR-01, PAR-02, PAR-03, PAR-04, PAR-05, PAR-06
**Success Criteria** (what must be TRUE):
  1. User can fill in cluster settings, traffic RPS, probe parameters, and request profiles, then start a simulation that runs with those values
  2. User can pause, resume, and adjust speed (0.5x to 100x) mid-simulation and see the change take effect immediately
  3. User can press "stop requests" to set RPS to 0 and observe pods recovering
  4. Elapsed simulation time, current 503 count, and ready pod count are always visible during a running simulation
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Report
**Goal**: After a simulation run, users get a summary report showing the critical failure timeline and recovery metrics
**Depends on**: Phase 3
**Requirements**: RPT-01, RPT-02, RPT-03, RPT-04, RPT-05, RPT-06
**Success Criteria** (what must be TRUE):
  1. Report shows the timeline of degradation: first readiness failure, first liveness failure (restart), and total service down (all pods not ready)
  2. Report shows recovery time from request stop to full pod readiness restoration
  3. Report shows per-profile average response time and overall 503 count/ratio
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Simulation Engine | 0/3 | Planning complete | - |
| 2. Visualization | 0/4 | Gap closure planned | - |
| 3. Controls & Parameters | 0/2 | Not started | - |
| 4. Report | 0/1 | Not started | - |
