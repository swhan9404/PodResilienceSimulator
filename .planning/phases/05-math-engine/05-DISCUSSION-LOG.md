# Phase 5: Math Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 05-math-engine
**Areas discussed:** Probe correction model, Knee curve & stability metric, Sweep parameter design, Engine API surface

---

## Probe Correction Model

| Option | Description | Selected |
|--------|-------------|----------|
| Effective capacity reduction | Subtract probe duty cycle from available workers: c_eff = c - (probe_rate × probe_duration × num_probe_types) | ✓ |
| Arrival rate inflation | Add probe arrivals to the request arrival rate: λ_eff = λ + probe_rate | |
| Utilization correction factor | Compute naive ρ, then apply multiplier: ρ_corrected = ρ / (1 - probe_overhead) | |

**User's choice:** Effective capacity reduction
**Notes:** Simple, matches the simulator's 1ms-per-probe model directly.

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded 1ms | Matches simulator's fixed 1ms probe processing | ✓ |
| Derive from probe config | Use timeoutSeconds from ProbeConfig as worst-case | |

**User's choice:** Hardcoded 1ms
**Notes:** Keeps math engine consistent with simulation results.

| Option | Description | Selected |
|--------|-------------|----------|
| Worker occupancy only | Only model worker-slot consumption (duty cycle) | ✓ |
| Worker + backlog effect | Also reduce effective K by expected probe queue depth | |

**User's choice:** Worker occupancy only
**Notes:** Backlog effects are second-order. Keep simple for v1.1.

---

## Knee Curve & Stability Metric

| Option | Description | Selected |
|--------|-------------|----------|
| Total workers vs P_block | X = total workers (cost proxy), Y = blocking probability | ✓ |
| Total workers vs utilization (ρ) | X = total workers, Y = utilization | |
| Pod count vs P_block | X = pod count (fixed workers), Y = P_block | |

**User's choice:** Total workers vs P_block
**Notes:** Intuitive: more workers → lower blocking. Knee = where adding more workers stops helping significantly.

| Option | Description | Selected |
|--------|-------------|----------|
| Percentile threshold | Return smallest config where P_block < threshold | ✓ |
| Return null with explanation | No recommendation, let UI explain | |
| Midpoint of sweep range | Pick middle of Pareto-optimal set | |

**User's choice:** Percentile threshold
**Notes:** Always produces a recommendation. STATE.md already noted this as expected fallback.

| Option | Description | Selected |
|--------|-------------|----------|
| 1% (0.01) | Industry-standard SLA target, 99% success | ✓ |
| 0.1% (0.001) | Stricter 99.9% success | |
| You decide | Let Claude pick | |

**User's choice:** 1% (0.01)
**Notes:** Matches typical production expectations.

---

## Sweep Parameter Design

| Option | Description | Selected |
|--------|-------------|----------|
| Auto from input RPS | Derive sensible min/max from input traffic parameters | ✓ |
| Fixed default ranges | Hardcoded ranges like workersPerPod: 1-16, podCount: 1-50 | |
| User-specified ranges | Let user set min/max in Phase 7 UI | |

**User's choice:** Auto from input RPS
**Notes:** User doesn't need to specify ranges manually — engine computes them.

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform +1 | Every integer combination within range | ✓ |
| Adaptive/logarithmic | Coarser steps at larger values | |

**User's choice:** Uniform +1
**Notes:** Auto-ranges keep grids small enough for instant computation.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed maxBacklog | Only sweep workersPerPod × podCount per MATH-03 | ✓ |
| Include maxBacklog as 3rd dimension | Sweep all three parameters | |

**User's choice:** Fixed maxBacklog
**Notes:** Keeps sweep 2D and fast. K stays at input value.

---

## Engine API Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone pure functions | Export computeMMcK(), computeSweep(), findKneePoint() independently | ✓ |
| Single orchestrator function | One optimize(config) => FullResult entry point | |
| Class with methods | class MathEngine with methods | |

**User's choice:** Standalone pure functions
**Notes:** No class, no state. Easy to test, easy to tree-shake.

| Option | Description | Selected |
|--------|-------------|----------|
| Own input type | Define OptimizerInput with only needed fields | ✓ |
| Reuse SimulationConfig | Accept SimulationConfig directly | |
| Subset via Pick<> | Pick<SimulationConfig, ...> | |

**User's choice:** Own input type
**Notes:** Decouples from simulator types. Phase 7 maps between them.

| Option | Description | Selected |
|--------|-------------|----------|
| src/optimizer/ | New top-level directory alongside simulation/ and visualization/ | ✓ |
| src/simulation/optimizer/ | Nested under simulation | |
| You decide | Let Claude pick | |

**User's choice:** src/optimizer/
**Notes:** Clear separation between DES engine and queuing math.

---

## Claude's Discretion

- Internal numeric precision choices (convergence thresholds for iterative Erlang C)
- Kneedle sensitivity parameter tuning
- Auto-range multiplier for sweep bounds derivation
- Internal function decomposition within src/optimizer/

## Deferred Ideas

None — discussion stayed within phase scope
