# Feature Research

**Domain:** Queuing theory capacity planning optimizer — statistical (math-based, no simulation) tool for infrastructure parameter selection
**Researched:** 2026-04-11
**Confidence:** MEDIUM-HIGH (queuing theory formulas are well-established; UI patterns synthesized from existing calculators + SRE tooling research)

---

## Context: What This Milestone Adds

v1.0 shipped a discrete-event simulator that answers "given these settings, watch how it breaks."
v1.1 adds a **mathematical optimizer** tab that answers the inverse: "given this traffic, what settings prevent failure?"

The optimizer is a separate tab/page in the same SPA. It does not run the simulator. It evaluates a closed-form mathematical model (M/M/c/K queuing theory + health probe occupancy) over a parameter sweep to find the stability boundary and highlight the cost-vs-stability knee point.

**Existing domain model that the optimizer inherits directly from `src/simulation/types.ts`:**
- `SimulationConfig`: `podCount`, `workersPerPod`, `maxBacklogPerPod`, `rps`, `requestProfiles[]`, `livenessProbe`, `readinessProbe`, `initializeTimeMs`
- `RequestProfile`: `name`, `latencyMs`, `ratio`
- `ProbeConfig`: `periodSeconds`, `timeoutSeconds`, `failureThreshold`, `successThreshold`

The optimizer's inputs are a **subset** of `SimulationConfig` (the traffic/probe side), and its outputs are **recommendations** for the infrastructure side (`podCount`, `workersPerPod`, `maxBacklogPerPod`).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the tool feels incomplete without. An engineer or SRE opening this tab expects these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Traffic parameter inputs** (RPS, slow request ratio, latencies) | Any capacity planning tool starts with "what load am I handling?" Users assume they can specify their traffic shape | LOW | Directly maps to existing `rps` + `requestProfiles[]` shape. No new data types needed. |
| **Infrastructure parameter sweep output** | The core output: show what combinations of `workersPerPod` × `podCount` are stable vs. unstable | MEDIUM | Computed by iterating over a grid of (pods, workers) values and evaluating the M/M/c/K model at each point |
| **Stability verdict per configuration** | Users need a clear stable / marginal / unstable classification for each candidate configuration | LOW | Three-zone classification: stable (utilization < ~70%), marginal (70–90%), unstable (>90% or dropping requests) |
| **Recommended configuration** | "Tell me what to use" — users want a single recommended setting, not just a table of numbers | LOW | Single output row: the minimum-cost config that is stable, highlighted with rationale |
| **Worker utilization metric** | The most fundamental queuing metric: ρ = λ/(c·μ). Every queuing tool surfaces this | LOW | ρ = effective_arrival_rate / (workers_per_pod × pod_count × service_rate). Must account for probe occupancy. |
| **Probe occupancy as a first-class input** | This is the entire reason the simulator exists. Any optimizer that ignores probe load is wrong for this domain | MEDIUM | Liveness and readiness probes consume ~1/periodSeconds of total worker capacity. Must subtract from available worker budget. |
| **Blocking probability / 503 rate estimate** | M/M/c/K finite-buffer formula gives P(blocking) — this directly corresponds to 503 rate | MEDIUM | Use M/M/c/K steady-state probabilities. P₀ calculation is the non-trivial step; implement as pure TS function. |
| **Human-readable explanation of recommendation** | Engineers need to justify config choices. "Use 8 workers/pod because utilization at 6 workers is 87%" | LOW | 2–3 sentence generated summary from computed values |

### Differentiators (Competitive Advantage)

Features that set this optimizer apart from a generic M/M/c calculator.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Knee point detection and annotation** | The central UX insight: show exactly where adding more workers stops helping. The visual "elbow" of the cost-vs-stability curve | MEDIUM | Find the inflection point in the stability-vs-workers curve. Second-derivative or simple heuristic (slope change > threshold). Annotate with arrow/label on chart. |
| **2D stability heatmap (podCount × workersPerPod)** | Shows the full parameter space at a glance — which (pods, workers) combinations are green/yellow/red | HIGH | Canvas or SVG 2D grid. X = podCount, Y = workersPerPod, cell color = utilization zone. Shows the entire frontier, not just a 1D slice. |
| **Cost dimension on the chart** | Map stability to resource cost (total workers = pods × workers/pod). X axis is cost, Y axis is stability metric. Makes the trade-off literally visible as a curve. | MEDIUM | No real currency — just "total worker slots" as a proxy for cost. Label the knee clearly. |
| **Probe occupancy breakdown** | Show how much of the worker budget probes consume vs actual requests. "At 4 workers/pod, liveness+readiness consume 0.8 workers (20% of capacity)" | LOW | Derived directly from probe period, timeout, and pod count. Pure arithmetic. |
| **Pre-fill from current simulator config** | "Use what I just simulated" — one click imports the traffic params from the simulator tab into the optimizer | LOW | Read from `useSimulationStore` config. Significant UX win for the most natural workflow. |
| **Comparison: optimizer recommendation vs. current sim config** | Highlights discrepancy between what the math says to use and what the user currently has configured in the simulator | LOW | Side-by-side: "Optimizer says 6 workers/pod, simulator uses 4. That is why it fails." |
| **Sensitivity columns (what changes if slow ratio increases)** | "If slow requests grow from 30% to 40%, which metric changes most?" Shows fragility | MEDIUM | Recompute model at ±10% slow ratio and show delta columns in results table |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly avoid.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Stochastic simulation within the optimizer** | "Why not just run the DES engine many times and take average?" | Completely defeats the purpose. The optimizer's value is instant math, not wait-for-simulation. Simulation results are already in the other tab. | Keep optimizer as pure closed-form math. Zero computation time. |
| **HPA / auto-scaling modeling** | SREs want to model Kubernetes HPA which dynamically adjusts pod count | Fundamentally changes the model — scaling lag, cooldown, scale-up time all matter and can't be captured by static M/M/c/K. This is a separate problem. | Document the limitation. Note that the optimizer assumes static pod count. |
| **Multi-service dependency chains** | "My service calls 3 other services, model the whole chain" | Out of scope for this domain (see PROJECT.md). Cascading call chains are a different class of problem. | Model only the single service's pod pool. |
| **Real traffic import (CSV/log parsing)** | "Let me paste my actual access logs to get RPS" | Scope creep. Parsing access logs is a separate feature with non-trivial engineering work and no connection to core value. | Users manually enter RPS from their APM/metrics. |
| **PDF/export report generation** | "I want to print this and give it to my manager" | Heavy implementation cost (jsPDF etc.). The core insight fits in a screenshot. | CSS print styles or "take a screenshot." No print-specific engineering. |
| **Exact percentile latency modeling (P99/P999)** | Users want P99-based estimates | M/M/c assumes exponential service times (memoryless). P99 requires different models (M/G/c or simulation). Claiming P99 accuracy from M/M/c is misleading. | Surface mean response time + utilization. Be explicit that M/M/c gives mean, not percentiles. Add disclaimer. |
| **Interactive probe configuration** | "Let me tweak liveness/readiness probe settings in the optimizer" | Probe configuration is already in the simulator tab. Duplicating it adds sync complexity. | Optimizer reads probe config from simulator store (pre-fill). Allow override only if explicitly needed. |
| **Animated / real-time updating charts** | "Make the charts animate as I change parameters" | For a math-only tab, animation adds visual noise without insight. Results are instantaneous. | Instant update on input change (no animation). Use smooth CSS transitions at most. |

---

## Feature Dependencies

```
[Traffic Inputs: RPS, slow ratio, latencies]
    └──required by──> [M/M/c/K engine: ρ, P_block, L_q]
                          └──required by──> [Stability classification (stable/marginal/unstable)]
                          └──required by──> [Recommended config (minimum stable point)]
                          └──required by──> [Knee point detection]
                          └──required by──> [2D heatmap (pods × workers)]

[Probe config: period, timeout]
    └──required by──> [Probe occupancy subtraction in M/M/c/K engine]
                          (probe occupancy reduces effective worker capacity)

[Simulator store (existing)]
    └──enhances──> [Traffic input pre-fill]
    └──enhances──> [Config comparison: optimizer vs. simulator]

[Cost axis = total_workers = pods × workers_per_pod]
    └──required by──> [Knee point chart (cost vs. stability)]

[Stability classification]
    └──required by──> [2D heatmap cell coloring]
    └──required by──> [Human-readable recommendation explanation]
```

### Dependency Notes

- **M/M/c/K engine requires probe occupancy subtraction:** The entire reason the simulator exists is that probes consume workers. If the optimizer ignores probe load, it will recommend under-provisioning. This is the domain-specific insight that makes this tool different from a generic M/M/c calculator.
- **Knee point detection requires a sweep result set:** Cannot detect a knee from a single point. Must iterate over a range of worker counts (or pod counts) to build the curve. The sweep is the minimum viable computation.
- **Pre-fill from simulator store enhances UX but does not block:** The optimizer is usable standalone. Pre-fill is a convenience shortcut.
- **2D heatmap conflicts with minimal-viable scope:** It is the most powerful visualization but also the most complex to implement. A 1D "workers vs. utilization" curve is sufficient for the MVP of the optimizer and can ship first.

---

## MVP Definition

### Launch With (this milestone, v1.1)

Minimum scope to validate the optimizer's core value: "find the stable region and show the knee."

- [ ] **M/M/c/K calculation engine (pure TS)** — deterministic math: given (rps, profiles, pods, workers, maxBacklog, probes) → (utilization, P_block, effective_rps). No stochastic elements. Testable with Vitest.
- [ ] **Probe occupancy deduction** — subtract probe worker consumption from available capacity before computing utilization. This is the domain-specific correction.
- [ ] **Traffic inputs form** — RPS, request profiles (list with latency + ratio), read-only display of loaded probe config.
- [ ] **1D sweep chart: workers/pod vs. utilization** — sweep `workersPerPod` from 1 to N at fixed `podCount`. Plot utilization curve. Mark knee. Color zones (green/yellow/red).
- [ ] **Recommended configuration callout** — highlight the first stable configuration on the sweep. Display total workers and "why" text.
- [ ] **Pre-fill from simulator config button** — one-click import of current simulator traffic parameters.

### Add After Validation (v1.x)

- [ ] **2D heatmap (podCount × workersPerPod)** — adds the second sweep dimension. More insightful but more complex to implement and render.
- [ ] **Sensitivity analysis columns** — recompute at ±20% slow ratio and show delta. Answers "how fragile is this recommendation?"
- [ ] **Side-by-side comparison vs. sim config** — "Optimizer says X, simulator uses Y."

### Future Consideration (v2+)

- [ ] **maxBacklog optimization** — currently a minor variable (large backlog ≈ queue buffer; very small backlog ≈ early 503s). Optimal backlog sizing is a second-order concern.
- [ ] **Confidence intervals / Monte Carlo overlay** — show how M/M/c/K mean estimates compare to simulator P95/P99 results for validation.
- [ ] **Multiple traffic scenarios** — compare "normal day" vs. "peak day" vs. "incident" in a single view.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| M/M/c/K calculation engine | HIGH | MEDIUM | P1 |
| Probe occupancy deduction | HIGH | LOW | P1 |
| Traffic inputs form | HIGH | LOW | P1 |
| 1D sweep chart (workers vs. utilization) | HIGH | MEDIUM | P1 |
| Knee point annotation on chart | HIGH | LOW | P1 |
| Recommended config callout + explanation | HIGH | LOW | P1 |
| Pre-fill from simulator config | MEDIUM | LOW | P1 |
| 2D heatmap (pods × workers) | HIGH | HIGH | P2 |
| Sensitivity analysis (+/- slow ratio) | MEDIUM | MEDIUM | P2 |
| Comparison: optimizer vs. sim config | MEDIUM | LOW | P2 |
| maxBacklog optimization | LOW | MEDIUM | P3 |
| Monte Carlo / sim result overlay | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add if time allows or in a follow-up PR
- P3: Nice to have, future milestone

---

## Queuing Theory Model Notes (Domain-Specific)

### The Core Model: M/M/c/K with Probe Occupancy

The existing simulator validates that the cascading failure mechanism is:
1. Slow requests occupy workers for long durations
2. Probes also occupy workers (probe timeout = 1s, period = 5-10s → each pod needs ~0.1-0.2 probe-dedicated workers)
3. When all workers are busy, probes time out
4. Consecutive probe failures trigger restart → cascading failure

The mathematical model mirrors this:

**Effective arrival rate to worker pool:**
```
lambda_eff = rps / pod_count
           + liveness_probe_rate   (= 1/liveness.periodSeconds, occupying timeoutSeconds each)
           + readiness_probe_rate  (= 1/readiness.periodSeconds, occupying timeoutSeconds each)
```

**Effective service rate per worker:**
```
mu = weighted_harmonic_mean_of(1/latencyMs_per_profile * ratio_per_profile)
   = 1 / (sum(ratio_i * latencyMs_i))     [for Poisson-exponential assumption]
```

**M/M/c/K parameters:**
- c = workersPerPod (servers)
- K = workersPerPod + maxBacklogPerPod (system capacity)
- lambda = lambda_eff (per pod)
- mu = mu_per_worker

**Stability metric:** ρ = lambda / (c * mu). ρ < 1 is necessary for stability; ρ > ~0.7 is the operational knee.

**Blocking probability (= 503 rate estimate):** P_block from M/M/c/K steady-state formula. For K >> c, approximates M/M/c (Erlang C). For small K (tight backlog), use exact M/M/c/K.

### What M/M/c/K Cannot Model

Be explicit in the UI:
- Assumes exponential service times (actual latencies may be bimodal: fast requests + slow requests)
- Assumes steady-state (no startup transients, no cascading failure dynamics)
- Assumes requests are independent (no correlated slow waves)
- Does not model the feedback loop where probe failures cause restarts, which reduce available pods, which increases per-pod load

The simulator handles all of the above. The optimizer is a fast approximation useful for initial sizing. **The optimizer recommends a starting point; the simulator validates it.**

---

## Competitor Feature Analysis

Existing queuing theory calculators (M/M/c tools at cbom.atozmath.com, omnicalculator.com, supositorio.com, erlang.chwyean.com) share common patterns:

| Feature | Generic M/M/c Calculators | This Optimizer |
|---------|---------------------------|----------------|
| Model selection (M/M/1, M/M/c, M/M/c/K) | Yes — user picks model | Fixed to M/M/c/K (the right model) — no choice needed |
| Arrival rate (lambda) | Single number input | Derived from RPS + request profiles + probe rates |
| Service rate (mu) | Single number input | Derived from weighted latency of request profiles |
| Servers (c) | Single number input | Swept over range to find optimal value |
| System capacity (K) | Single number input | Derived from workers + maxBacklog |
| Output: utilization, Lq, Wq, P0 | Yes — table of scalar values | Yes — same values, but shown as a curve across parameter sweep |
| Output: knee point | Never shown | Core feature — annotated on chart |
| Output: recommendation | Never — just raw numbers | "Use 8 workers/pod" with rationale |
| Domain: Kubernetes/probe awareness | None — generic math tool | First-class: probe occupancy is in the model |
| Integration with simulator | None | Pre-fill from simulator config; compare vs. sim results |
| Visualization: 2D heatmap | None | P2 feature — differentiator |

The gap is large. Generic calculators are single-point evaluators with no sweep, no recommendation, no domain context. This optimizer's value is the sweep + knee annotation + domain-specific probe modeling.

---

## Dependencies on Existing Codebase

| Existing Asset | How Optimizer Uses It |
|----------------|----------------------|
| `SimulationConfig` type (types.ts) | Optimizer input form maps directly to this type's traffic/probe fields |
| `RequestProfile[]` type | Optimizer uses profiles list for weighted mu calculation |
| `ProbeConfig` type | Optimizer subtracts probe occupancy using these fields |
| `useSimulationStore` | Pre-fill button reads `config` from store; no write-back needed |
| Tailwind CSS layout | Optimizer tab uses same layout tokens as simulator |
| uPlot (already installed) | Can reuse for 1D sweep chart; same library, new chart instance |

**No new dependencies required for P1 features.** The M/M/c/K math is pure TypeScript. The chart reuses uPlot. The form reuses existing component patterns.

---

## Sources

- Queuing theory formulas: M/M/c Wikipedia (https://en.wikipedia.org/wiki/M/M/c_queue), M/M/c/K model
- Knee of a curve: Wikipedia (https://en.wikipedia.org/wiki/Knee_of_a_curve), Neil Gunther "Response Time Knees and Queues" (http://perfdynamics.blogspot.com/2009/08/response-time-knees-and-queues.html)
- Half-latency rule for knee (71.5% utilization): ResearchGate (https://www.researchgate.net/publication/283046699_Half-Latency_Rule_for_Finding_the_Knee_of_the_Latency_Curve)
- Capacity planning tool UI patterns: harness.io SRE capacity planning guide, teamhood.com top capacity planning tools 2025
- Existing queuing calculators reviewed: omnicalculator.com, supositorio.com, erlang.chwyean.com, tools.ntsd.dev
- Gunicorn/K8s probe worker occupancy problem: GitHub gunicorn issue #2467 (https://github.com/benoitc/gunicorn/issues/2467)
- Queueing Theory and Modeling (Linda Green, Columbia): https://business.columbia.edu/sites/default/files-efs/pubfiles/5474/queueing%20theory%20and%20modeling.pdf

---
*Feature research for: Statistical Optimizer — v1.1 milestone*
*Researched: 2026-04-11*
