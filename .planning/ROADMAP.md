# Roadmap: Slow Request Simulator

## Milestones

- v1.0 MVP — Phases 1-4 (shipped 2026-04-11)
- v1.1 Statistical Optimizer — Phases 5-7 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-4) — SHIPPED 2026-04-11</summary>

- [x] Phase 1: Simulation Engine (3/3 plans) — Headless DES core with pod state machines, health checks, load balancer, metrics
- [x] Phase 2: Visualization (4/4 plans) — Canvas pod grid and uPlot time-series charts
- [x] Phase 3: Controls & Parameters (2/2 plans) — React UI for lifecycle, speed control, parameter configuration
- [x] Phase 4: Report (2/2 plans) — Post-simulation report with degradation timeline, summary cards, profile table

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Statistical Optimizer (In Progress)

**Milestone Goal:** Queuing-theory-based mathematical optimizer that finds the optimal infrastructure settings for a given traffic profile, without running a simulation.

- [ ] **Phase 5: Math Engine** - M/M/c/K queuing model with probe correction, parameter sweep, and knee point detection
- [ ] **Phase 6: Tab Navigation** - Tab switching between simulator and optimizer with keepMounted state preservation
- [ ] **Phase 7: Optimizer UI** - Traffic input form, stability chart, recommendation cards, and simulator pre-fill

## Phase Details

### Phase 5: Math Engine
**Goal**: Users can compute infrastructure stability metrics from traffic parameters using queuing theory, without running a simulation
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: MATH-01, MATH-02, MATH-03, MATH-04
**Success Criteria** (what must be TRUE):
  1. Given RPS and request profile inputs, the engine returns blocking probability (P_block), wait time (Wq), and utilization (rho) consistent with M/M/c/K textbook values
  2. Probe occupancy correction produces higher utilization than naive M/M/c for the same inputs (probes consume workers)
  3. Parameter sweep over workersPerPod x podCount range produces a sorted array of stability metrics for every combination
  4. Knee point detection identifies the cost-efficiency inflection point on the sweep curve, and falls back gracefully when no knee exists (monotone/flat curves)
  5. Erlang C computation produces correct results at c=20, rho=0.99 with no NaN or Infinity
**Plans**: 2 plans
Plans:
- [x] 05-01-PLAN.md — M/M/c/K queuing core with probe correction and textbook verification
- [x] 05-02-PLAN.md — Parameter sweep, knee point detection, and barrel re-exports

### Phase 6: Tab Navigation
**Goal**: Users can switch between simulator and optimizer views without losing state in either
**Depends on**: Phase 5
**Requirements**: NAV-01
**Success Criteria** (what must be TRUE):
  1. Tab bar with "Simulator" and "Optimizer" tabs is visible and switches the active view on click
  2. Starting a simulation, switching to the Optimizer tab, then switching back shows the simulation still running (RAF loop intact, metrics updating)
  3. Both views remain mounted in the DOM at all times (CSS visibility toggle, not conditional rendering)
**Plans**: TBD

### Phase 7: Optimizer UI
**Goal**: Users can input traffic parameters, see the optimal infrastructure recommendation, and visualize the cost-stability tradeoff curve with knee point
**Depends on**: Phase 5, Phase 6
**Requirements**: OPTUI-01, OPTUI-02, OPTUI-03, OPTUI-04
**Success Criteria** (what must be TRUE):
  1. User can enter RPS, slow request ratio, and request latency profiles in a form and trigger optimization
  2. Recommended workersPerPod, podCount, and maxBacklog are displayed as a card with the corresponding utilization and blocking probability
  3. uPlot chart shows total workers vs blocking probability curve with the knee point annotated as a visible marker
  4. Clicking "pre-fill from simulator" copies the current simulator config into the optimizer input fields without affecting simulator state
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 5 -> 6 -> 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Simulation Engine | v1.0 | 3/3 | Complete | 2026-04-11 |
| 2. Visualization | v1.0 | 4/4 | Complete | 2026-04-11 |
| 3. Controls & Parameters | v1.0 | 2/2 | Complete | 2026-04-11 |
| 4. Report | v1.0 | 2/2 | Complete | 2026-04-11 |
| 5. Math Engine | v1.1 | 0/2 | Planned | - |
| 6. Tab Navigation | v1.1 | 0/? | Not started | - |
| 7. Optimizer UI | v1.1 | 0/? | Not started | - |
