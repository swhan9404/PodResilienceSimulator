---
phase: 05-math-engine
plan: 01
subsystem: optimizer
tags: [queuing-theory, math-engine, mmck, probe-correction]
dependency_graph:
  requires: []
  provides: [computeMMcK, computeEffectiveWorkers, OptimizerInput, MMcKResult, SweepPoint, KneeResult, ProbeParams]
  affects: [05-02-sweep-kneedle]
tech_stack:
  added: []
  patterns: [iterative-ratio-accumulation, probe-duty-cycle-correction, epsilon-comparison]
key_files:
  created:
    - src/optimizer/types.ts
    - src/optimizer/queuing.ts
    - src/optimizer/queuing.test.ts
  modified: []
decisions:
  - Iterative ratio accumulation instead of factorial computation for numerical stability at c>=18
  - Probe correction as simple duty-cycle subtraction (c_eff = c - probeDutyCycle) per D-01/D-02/D-03
  - Clamp c_eff to 0.01 minimum to prevent division by zero in degenerate cases
  - rho=1 edge case uses special Lq formula with epsilon check (1e-10) per research pitfall #2
metrics:
  duration: 178s
  completed: "2026-04-12T02:55:44Z"
  tasks_completed: 1
  tasks_total: 1
  test_count: 11
  lines_added: 231
---

# Phase 5 Plan 1: M/M/c/K Queuing Model Core Summary

M/M/c/K queuing model with iterative ratio accumulation (no factorial overflow) and probe occupancy correction, verified against textbook Erlang B values.

## What Was Done

### Task 1: Define optimizer types and implement M/M/c/K with probe correction (TDD)

**RED phase:** Created 11 test cases covering textbook values (M/M/1/1 pBlock=0.3333, M/M/2/4 pBlock=0.3990), numerical stability (c=20 rho=0.99), rho=1 edge case, guard clauses (c<=0, mu<=0, K<=0, lambda=0), probe correction exact value and clamping, and probe-corrected rho validation.

**GREEN phase:** Implemented `computeMMcK` using iterative ratio accumulation that builds P_n/P_0 ratios without ever computing raw factorials. Implemented `computeEffectiveWorkers` with probe duty cycle subtraction and 0.01 floor clamp.

**Types created:** OptimizerInput, MMcKResult, SweepPoint, KneeResult, ProbeParams -- all decoupled from SimulationConfig per D-11.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `ee09b3e` | test | Add failing tests for M/M/c/K queuing model and probe correction (TDD RED) |
| `ea7c182` | feat | Implement M/M/c/K queuing model with probe correction (TDD GREEN) |

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| types.ts export interface count | 5 | 5 | PASS |
| queuing.ts export function count | 2 | 2 | PASS |
| "factorial" in queuing.ts | 0 | 0 | PASS |
| rho=1 epsilon comparison | present | present | PASS |
| Math.max 0.01 clamp | present | present | PASS |
| Test case count | >= 8 | 11 | PASS |
| All tests pass | exit 0 | exit 0 | PASS |
| Full test suite (148 tests) | pass | pass | PASS |

## Key Numbers

- M/M/1/1 (lambda=0.5, mu=1, c=1, K=1): pBlock = 0.3333 (textbook: 0.3333)
- M/M/2/4 (lambda=3, mu=1, c=2, K=4): pBlock = 0.3990 (textbook: 0.3990)
- c=20, rho=0.99: all fields finite, no NaN/Infinity
- Probe correction (4 workers, liveness@10s, readiness@5s): c_eff = 3.9997

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all functions are fully implemented with complete logic.

## Self-Check: PASSED
