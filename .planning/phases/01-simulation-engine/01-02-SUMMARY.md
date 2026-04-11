---
phase: 01-simulation-engine
plan: 02
subsystem: simulation-core
tags: [pod, load-balancer, state-machine, tdd]
dependency_graph:
  requires: ["01-01 (types, priority-queue, rng)"]
  provides: ["Pod class", "LoadBalancer class", "RoundRobinStrategy", "ProbeResult interface"]
  affects: ["01-03 (engine.ts uses Pod and LoadBalancer)"]
tech_stack:
  added: []
  patterns: ["FIFO backlog queue", "probe counter threshold", "generation-based event cancellation", "strategy pattern for LB", "ready-set composition change detection"]
key_files:
  created:
    - src/simulation/pod.ts
    - src/simulation/pod.test.ts
    - src/simulation/load-balancer.ts
    - src/simulation/load-balancer.test.ts
  modified: []
decisions:
  - "ProbeResult as plain interface (not enum) for action: 'none' | 'remove_from_lb' | 'add_to_lb' | 'restart'"
  - "NOT_READY pods accept requests via tryAccept directly; LB controls routing, not Pod"
  - "Ready-set composition change detected via sorted ID string key comparison"
  - "Readiness history pushed before early-return on threshold hit to ensure complete history tracking"
metrics:
  duration: "3m 33s"
  completed: "2026-04-11T02:11:58Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 45
  tests_passing: 45
---

# Phase 01 Plan 02: Pod & Load Balancer Summary

Pod 3-state machine (READY/NOT_READY/RESTARTING) with synchronous worker slots, FIFO backlog, probe threshold tracking, and generation-based restart. LoadBalancer with RoundRobinStrategy distributing to READY pods only, with index reset on composition change.

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Pod state machine with workers, backlog, probe handling | f5d503d | src/simulation/pod.ts, src/simulation/pod.test.ts |
| 2 | LoadBalancer with round-robin strategy | 9e46505 | src/simulation/load-balancer.ts, src/simulation/load-balancer.test.ts |

## What Was Built

### Pod (src/simulation/pod.ts)

Core simulation component modeling a Kubernetes pod with synchronous workers:

- **State machine**: READY -> NOT_READY (readiness failures), NOT_READY -> READY (readiness successes), any -> RESTARTING (liveness failures), RESTARTING -> NOT_READY (initComplete)
- **Worker slots**: Fixed-size array of ActiveRequest | null. tryAccept assigns to first idle slot.
- **FIFO backlog**: Array.push + Array.shift. When worker completes, next backlog item auto-assigned.
- **Probe tracking**: Separate liveness/readiness ProbeCounters with consecutive failure/success thresholds. History arrays for visualization.
- **Restart**: Clears all workers + backlog, increments generation (for event cancellation), resets counters/history. Returns dropped count.
- **Snapshot**: getSnapshot(currentTime) produces PodSnapshot with clamped worker progress (0..1).

Key behavior: NOT_READY does NOT clear workers (Pitfall #9). Only restart() drops everything. NOT_READY pods still accept direct tryAccept calls -- the engine/LB controls routing.

### LoadBalancer (src/simulation/load-balancer.ts)

- **RoundRobinStrategy**: Implements LoadBalancerStrategy interface. Cycles through readyPodIds array.
- **Ready-set detection**: Tracks sorted pod ID key. When composition changes, calls strategy.reset() (Pitfall #7).
- **Null return**: When no READY pods exist, returns null (caller handles as 503).
- **Strategy pattern**: Constructor-injected LoadBalancerStrategy allows future strategies.

## Requirements Coverage

| Requirement | Status | Test Coverage |
|-------------|--------|---------------|
| POD-01 | Done | 6 state transition tests |
| POD-02 | Done | 3 worker slot tests |
| POD-03 | Done | 2 backlog queue tests |
| POD-04 | Done | 1 backlog full rejection test |
| POD-05 | Done | 3 restart tests (drop count, generation, counter reset) |
| POD-06 | Done | 2 initComplete tests |
| HC-01 | Done | 1 probe-as-request test |
| HC-02 | Done | 1 probe backlog test |
| HC-04 | Done | 1 backlog full probe rejection test |
| HC-05 | Done | 2 liveness threshold tests |
| HC-06 | Done | 2 readiness failure tests |
| HC-07 | Done | 2 readiness recovery tests |
| LB-01 | Done | 2 round-robin distribution tests |
| LB-02 | Done | 2 all-not-ready null return tests |
| LB-03 | Done | 2 strategy pattern tests |

## Pitfalls Addressed

| Pitfall | How Addressed | Test |
|---------|--------------|------|
| #7 RR index corruption | Ready-set key comparison triggers strategy.reset() | Pitfall #7 test suite (2 tests) |
| #9 NOT_READY vs RESTARTING | NOT_READY keeps workers; only restart() clears | Pitfall #9 test suite (2 tests) |
| #15 FIFO backlog | Array.push + Array.shift, verified dequeue order A,B,C | Pitfall #15 FIFO test |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Readiness history not recorded on threshold-hit early return**
- **Found during:** Task 1 GREEN phase
- **Issue:** pushHistory for readiness was placed after the early-return branches for add_to_lb/remove_from_lb, meaning history would miss the threshold-triggering probe result
- **Fix:** Moved pushHistory call to before the success/failure branching in the readiness block
- **Files modified:** src/simulation/pod.ts
- **Commit:** f5d503d

## Verification Results

- `npx vitest run src/simulation/pod.test.ts` -- 33 tests passing
- `npx vitest run src/simulation/load-balancer.test.ts` -- 12 tests passing
- `npx vitest run` -- 64 tests passing (all 4 test files, including Wave 1 foundation)
- Pod state transitions match SPEC.md state diagram
- Backlog is FIFO (verified by test)
- NOT_READY does not clear workers (verified by test)
- RR index resets on composition change (verified by test)

## Self-Check: PASSED

- All 4 created files exist on disk
- Both task commits (f5d503d, 9e46505) found in git log
- All 64 tests passing across full test suite
