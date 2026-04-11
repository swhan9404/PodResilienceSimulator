# Domain Pitfalls

**Domain:** Adding queuing-theory-based statistical optimizer to existing browser-based discrete event simulator (v1.1 milestone)
**Researched:** 2026-04-11
**Confidence:** HIGH for math/algorithm pitfalls (established literature); MEDIUM for UI/integration pitfalls (inference from patterns)

---

## Critical Pitfalls

Mistakes that cause incorrect recommendations, misleading outputs, or unusable results.

---

### Pitfall 1: Standard M/M/c Ignores the Probe-as-Worker-Consumer

**What goes wrong:**
The standard M/M/c model assumes all `c` servers are available for requests. In this system, each pod has `workersPerPod` workers, but liveness and readiness probes periodically occupy one worker each (serialized per probe type by the FIFO backlog). The model treats `effectiveWorkers = workersPerPod` but the real throughput-available workers at any moment is `workersPerPod - probeSlotsConsumed`.

At probe arrival rate `2 / periodSeconds` and probe service time of essentially 0 (1ms in the sim), the mean concurrency consumed by probes is negligible under normal load. But at high utilization (ρ → 1), the probe occupying a worker for even 1ms pushes the queue over a tipping point. The model misses this and predicts stability when the real system cascades.

**Why it happens:**
Standard M/M/c derivations in textbooks do not model periodic background tasks that consume server capacity. Developers apply the formula without adjusting the effective service rate.

**How to avoid:**
Model probes as a separate background Poisson process with rate `λ_probe = 2 / periodSeconds` per pod (liveness + readiness). Adjust effective worker capacity: `c_eff = workersPerPod - E[probe_occupancy]`. For near-instantaneous probe service (1ms), `E[probe_occupancy] ≈ λ_probe * serviceTime_probe`. Include probe traffic in the total offered load: `λ_total = λ_requests + λ_probe * podCount`.

More critically: model the probe timeout mechanism. When workers are saturated, probes queue. If probe wait time exceeds `timeoutSeconds`, the probe counts as failure. After `failureThreshold` failures, the pod restarts. This cascade mechanism is entirely absent from standard M/M/c and must be layered on top via a supplementary state machine model.

**Warning signs:**
- Optimizer recommends a config that "passes" mathematically but the simulator shows cascading failure
- Probe timeout time (`timeoutSeconds`) has no parameter in the optimizer input form
- Calculated utilization ρ is close to 1.0 but no warning is shown about probe sensitivity

**Phase to address:**
Math engine phase (Phase 1 of v1.1). The probe adjustment must be baked into the core calculation, not added as an afterthought.

---

### Pitfall 2: Steady-State Assumption Applied to a Transient Failure System

**What goes wrong:**
M/M/c/K steady-state formulas assume the system has reached statistical equilibrium. The cascading failure scenario this tool models is fundamentally a transient phenomenon — the system starts healthy, degrades over minutes, then fails completely. Steady-state analysis gives an average behavior that masks the failure mode entirely.

Specifically: at ρ = 0.85, steady-state M/M/c/K says "queue is stable, expected wait is X ms." But in the real system, slow requests lock workers for minutes. The system is not in steady state — it is on a degradation trajectory where each probe failure increases load on remaining pods until cascade.

**Why it happens:**
Steady-state formulas are what textbooks teach and what online calculators implement. The transient path to failure is much harder to model analytically.

**How to avoid:**
Be explicit in the UI that the optimizer outputs are steady-state stability predictions, not cascade timing predictions. The optimizer answers: "Given these params, will the system eventually reach a stable operating point?" The simulator answers: "How long does it take to get there or to fail?" Frame the optimizer as a configuration screener, not a replacement for simulation.

For the cascade mechanism specifically: use a supplementary rule-based analysis on top of M/M/c/K. If `ρ > (workersPerPod - 1) / workersPerPod` (one worker tied up by a slow request reduces effective workers), flag as "at-risk." If the probe timeout is shorter than the slow request duration, flag as "cascade-prone."

**Warning signs:**
- Optimizer and simulator disagree by more than 20% on worker utilization
- A config passes the optimizer but simulations consistently show failure
- The UI implies the optimizer predicts "when" failure happens (it cannot)

**Phase to address:**
Phase 1 (math engine) — the limitation must be modeled. Phase 2 (UI) — the limitation must be communicated clearly to users.

---

### Pitfall 3: Erlang C Numerical Instability at High Utilization

**What goes wrong:**
The Erlang C formula (used in M/M/c analysis) involves `c^c * c!` in the denominator. At `c = 20` workers per pod and high utilization, these values overflow IEEE 754 double-precision floating point before the formula cancels them. The result is `NaN`, `Infinity`, or silently wrong numbers.

JavaScript `Number.MAX_SAFE_INTEGER` is `2^53`. `20!` is `2.4 × 10^18`, which exceeds `Number.MAX_SAFE_INTEGER` (`9 × 10^15`). At `workersPerPod = 20`, naive Erlang C computation breaks entirely.

**Why it happens:**
Direct formula implementation from textbooks does not account for floating-point scale. The overflow is silent in many cases — the result is just a very large or very small number that passes superficial sanity checks.

**How to avoid:**
Use the recursive/iterative form instead of direct computation. The Erlang B inverse recurrence is numerically stable: `1/B(A,j) = 1 + (j/A) * 1/B(A,j-1)`. Express Erlang C in terms of Erlang B to inherit this stability. Alternatively, compute in log-space using `Math.log` / `Math.exp` throughout, converting back only at the final step.

Explicit guard: check `ρ >= 1` before computing — the formula is undefined in this regime. Return a structured error, not `NaN`.

Write unit tests specifically at boundary values: `c = 1, 4, 10, 20`, `ρ = 0.5, 0.9, 0.99, 1.0, 1.01`.

**Warning signs:**
- `NaN` or `Infinity` appearing in computed metrics
- Results that are identical regardless of worker count changes
- Any calculation path that computes `c!` directly via a loop

**Phase to address:**
Phase 1 (math engine). Numerical stability must be verified by unit tests before any UI is built on top of it.

---

### Pitfall 4: Optimizer and Simulator Appear to Contradict Each Other

**What goes wrong:**
User sets parameters in the optimizer, gets a recommendation, switches to the simulator tab with those parameters, runs the simulation, and the simulator shows failure when the optimizer said "stable." User concludes one of them is broken. Trust in both tools collapses.

This divergence is mathematically inevitable: M/M/c assumes Poisson arrivals (exponential inter-arrivals) and exponential service times. The simulator uses a seeded PRNG with specific request profiles that may have non-exponential latency distributions (e.g., bimodal: 100ms normal + 10s slow). The steady-state formula predicts average behavior, not the specific failure path driven by the slow-request tail.

**Why it happens:**
No explanation is provided about why the tools use different models. Users assume both tools are modeling the same thing.

**How to avoid:**
Add explicit UI copy: "The optimizer uses M/M/c steady-state analysis (best-case stability bound). The simulator models the actual cascade dynamics including probe failures. Use the optimizer to find candidate configs, then validate with simulation." 

Where possible, surface the same metrics in both views (e.g., theoretical vs. simulated worker utilization) so users can see the delta and understand the model gap.

**Warning signs:**
- No explanation text near optimizer results about model assumptions
- Optimizer output has the same units/labels as simulator metrics but different values
- No cross-link between optimizer recommendation and simulator parameters

**Phase to address:**
Phase 2 (UI) — the framing must be designed from the start. Phase 1 (math engine) — document which assumptions are being made so the UI can surface them accurately.

---

### Pitfall 5: Knee Point Detection on a Monotone or Noisy Curve

**What goes wrong:**
The cost-vs-stability curve (e.g., X = total workers, Y = predicted failure probability) may be monotonically decreasing without a clear inflection. Applying Kneedle or similar algorithms to a smooth monotone curve produces a false knee at an arbitrary point. Worse, at small parameter sweeps (e.g., only 5-10 data points), the curve is noisy enough that the detected knee moves unpredictably as input params change.

Kneedle is also sensitive to normalization: if the X axis (cost) spans 1-100 and Y axis (stability) spans 0.99-1.0, the normalization step treats the Y range as tiny, potentially mislocating the knee.

**Why it happens:**
Developers implement Kneedle because it is the canonical algorithm (the paper is widely cited). They do not validate that the curve being analyzed actually has a knee. The algorithm always returns something — it does not report "no knee found."

**How to avoid:**
Before knee detection, validate that the curve is non-monotone or has sufficient curvature. Specifically: check that the second derivative changes sign. If the curve is monotone, fall back to a percentile-based heuristic: "the point where adding one more worker reduces failure probability by less than X%."

Use a minimum of 15-20 data points for knee detection. With fewer than 10 points, Kneedle produces unreliable results.

Apply smoothing (3-5 point moving average) before knee detection to reduce noise sensitivity.

Always display the full curve and the detected knee point together — let the user visually override the detected knee if it looks wrong.

**Warning signs:**
- Knee point jumps dramatically when a single input parameter changes slightly
- The knee is always at the first or last data point
- The curve being analyzed has a coefficient of variation of output values less than 0.05 (essentially flat)

**Phase to address:**
Phase 1 (math engine) — the sweep algorithm and knee detection logic. Phase 2 (UI) — always show the full curve, not just the knee result.

---

## Moderate Pitfalls

---

### Pitfall 6: Parameter Sweep Blocking the Main Thread

**What goes wrong:**
Finding the knee point requires sweeping across a range of parameter combinations (e.g., `podCount` 1-20, `workersPerPod` 1-20 = 400 combinations). Each combination requires computing Erlang C, steady-state probabilities, and cascade risk scores. At 400 combinations × ~0.1ms per calculation = 40ms synchronous JavaScript — this freezes the browser tab for a perceptible instant.

If the sweep is triggered on every slider change (immediate recalculation), a user dragging the RPS slider triggers dozens of 40ms freezes per second.

**Why it happens:**
Mathematical calculations feel "instant" in development testing with small ranges. Performance degrades linearly with sweep size. The problem only appears at production-scale parameter ranges.

**How to avoid:**
Debounce parameter changes with a 200-300ms delay before triggering sweep. For the sweep itself, chunk execution using `setTimeout(fn, 0)` between batches or use `requestIdleCallback` to yield between computation chunks. If sweep time consistently exceeds 50ms, move computation to a Web Worker.

Profile the sweep computation time explicitly before shipping. Log `performance.now()` before and after a full sweep at max range.

**Warning signs:**
- Sweep is triggered synchronously in an onChange handler without debounce
- The sweep iterates over all combinations in a single synchronous loop
- No measurement of sweep execution time in development

**Phase to address:**
Phase 1 (math engine) — design the computation to be chunked. Phase 2 (UI) — add debounce on inputs.

---

### Pitfall 7: Bimodal Latency Distribution Mapped to Single Service Rate

**What goes wrong:**
The simulator uses request profiles with mixed latencies (e.g., 90% at 200ms, 10% at 8000ms). M/M/c requires a single exponential service time parameter μ. Developers naively use the weighted average: `μ = 1 / (0.9 * 200ms + 0.1 * 8000ms) = 1 / 980ms`. 

This underestimates instability severely. The slow request tail (8000ms) is what saturates workers and blocks probes. The average-based μ gives ρ = 0.49 (looks very safe), while the slow request subset alone would give ρ = 1.28 per slow request slot (catastrophic).

**Why it happens:**
M/M/c is derived for exponential service times. A bimodal distribution is not exponential, and the mean does not capture the tail behavior that causes failures in this specific system.

**How to avoid:**
Use the `slowRequestRatio * slowLatency / workersPerPod` sub-calculation to produce a "slow-request-only ρ" as an additional signal. If `slowRatio * slowLatency / (workersPerPod * 1000ms)` > 0.8, flag as high-risk regardless of the average ρ.

Explicitly document in the UI that the model assumes exponential service times and that bimodal distributions (normal + slow) are approximated. Consider providing a "slow request saturation" metric separately from Erlang C ρ.

**Warning signs:**
- Service rate μ is computed as `1 / weightedAvgLatency` without further analysis
- The slow request ratio and slow request latency have no separate effect on the output
- System with 50% slow requests at 10s shows the same stability score as system with 5% slow requests at 10s

**Phase to address:**
Phase 1 (math engine). The slow-request approximation must be built into the core model, not added later.

---

### Pitfall 8: Optimizer State Coupling to Simulator State

**What goes wrong:**
The optimizer tab shares Zustand store config state with the simulator tab. When a user changes parameters in the optimizer to explore configs, those changes immediately affect the simulator's config. The user returns to the simulator tab and finds a running simulation using different parameters than they set up, or a completed simulation whose report reflects optimizer exploration, not intentional simulator runs.

**Why it happens:**
The easiest implementation is to reuse the existing `SimulationConfig` Zustand store for optimizer inputs. It minimizes new code but couples two independent workflows.

**How to avoid:**
Give the optimizer its own state slice — `OptimizerConfig` separate from `SimulationConfig`. On "Run in Simulator" (the CTA button), copy optimizer config into simulator config with an explicit user action. Do not share config state bidirectionally.

**Warning signs:**
- Optimizer form binds directly to the same Zustand atoms as the simulator parameter panel
- Changing optimizer inputs causes the simulator's "ready to run" config to change
- No explicit "transfer to simulator" action

**Phase to address:**
Phase 2 (UI/state). Must be designed into the state architecture from the start of the UI phase.

---

### Pitfall 9: Treating Optimizer Output as Prescriptive Instead of Indicative

**What goes wrong:**
The optimizer outputs a single "recommended" config: "Use 3 pods, 6 workers each, backlog 15." The user deploys this config to production. But M/M/c/K is a steady-state average model that cannot account for:
- Traffic spikes (bursty arrivals violate the Poisson assumption)
- Slow request bursts (correlated arrivals, not independent)
- Restart overhead (during initializeTime, pods are offline, load concentrates on remaining pods)

The user trusts the recommendation and experiences a real outage.

**Why it happens:**
Single-number recommendations feel authoritative. Users tend to take "recommended config" at face value without reading caveats.

**How to avoid:**
Always display the recommendation alongside its safety margin. Instead of "Use 6 workers," show "6 workers (ρ = 0.72, safety margin: 28% below saturation)." Provide a warning if the recommended ρ exceeds 0.7. Explicitly label the output as "minimum viable config — add safety margin for production."

Recommend the simulator as the validation step before any production deployment decision.

**Warning signs:**
- Recommendation is a single config with no confidence range or safety margin
- No warning when recommended ρ is above 0.7
- No text advising to validate with simulation before production use

**Phase to address:**
Phase 2 (UI) — framing and safety warnings. Phase 1 (math engine) — compute safety margin as a first-class output.

---

### Pitfall 10: Tab Architecture Breaks Simulator State on Navigation

**What goes wrong:**
Switching between the Simulator tab and Optimizer tab unmounts and remounts the Simulator component. A running or paused simulation loses its RAF loop reference, its engine instance, or its Canvas context. The user returns to the simulator tab to find it reset or blank.

**Why it happens:**
React's default behavior unmounts components when they are no longer rendered. The existing simulator may not be designed to survive unmount/remount because in v1.0 there was only one view.

**How to avoid:**
Use `display: none` CSS toggling (or a `keepMounted` prop pattern) rather than conditional rendering for tab switching. The simulator component stays mounted; only its visibility changes. Alternatively, persist the engine reference in Zustand or a module-level singleton that survives component unmount.

If using `React.lazy` for tab code splitting, ensure the simulator tab is NOT lazily loaded — it should be in the initial bundle since it's the primary feature.

**Warning signs:**
- Tab switching implemented as `{activeTab === 'simulator' && <Simulator />}`
- The RAF loop is started in a `useEffect` with no persistence mechanism
- No test for "switch to optimizer, switch back, simulation still running"

**Phase to address:**
Phase 2 (UI). Must be the first thing verified when implementing the tab UI.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use weighted average latency for μ | Single M/M/c formula, easy to explain | Underestimates failure risk from slow-request tail; users get false confidence | Never — always compute slow-request ρ separately |
| Skip probe overhead adjustment in M/M/c | Simpler math, faster to implement | Model diverges from simulator at high utilization; probe cascade not predicted | Never for this domain |
| Share SimulationConfig store with optimizer | Zero new code | Cross-tab state contamination; user confusion when configs drift | Never |
| Compute full sweep synchronously on every input change | Simple, immediate feedback | Main thread freeze on wide parameter ranges | Only with debounce AND range < 50 combinations |
| Use a single "recommended config" without safety margins | Clean, simple UI | Misleads users into unsafe production deployments | Never — always show ρ and margin |
| Hard-code Erlang C direct formula without stability guard | Matches textbook exactly | NaN/Infinity at high c or ρ; silent wrong results | Never without a `ρ >= 1` guard |

---

## Integration Gotchas

Common mistakes when connecting the optimizer to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Existing SimulationConfig type | Reuse existing type for optimizer inputs verbatim | Define a separate `OptimizerInput` type — may need fields like `slowRequestRatio` that are derived from `requestProfiles` but expressed differently |
| Simulator's request profiles (array of latency/ratio objects) | Pass array directly to optimizer | Extract `slowRequestRatio` and `effectiveAvgLatency` as scalar inputs to the optimizer math; the array format is a UI concern, not a math concern |
| Existing routing / navigation | Add React Router for tabs | The project has no router — use a simple `activeTab` state in App.tsx with CSS visibility; adding React Router is overengineering for two tabs |
| Canvas context on tab switch | Canvas ref becomes stale after remount | Use `keepMounted` visibility pattern; do not recreate Canvas on tab return |
| Zustand store | Add optimizer state to existing simulation store | Add a separate `useOptimizerStore` with its own slice to avoid entangling concerns |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full 2D parameter sweep on every input change | Slider drag causes visible jank | Debounce 200ms + chunk computation | Sweep size > 50 combinations |
| Recomputing knee detection every render | Component re-renders cause visible stutter | Memoize sweep results; recompute only on input change, not on render | Any component that re-renders at >10Hz |
| Plotting full sweep results without downsampling | Chart with 400 points causes initial render lag | Limit chart to 50 representative points via downsampling | Sweep size > 100 points |
| Computing factorial directly for large c | NaN/Infinity at c >= 18 | Use iterative Erlang C recurrence | workersPerPod >= 18 |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw ρ value without context | User doesn't know if 0.72 is good or bad | Show ρ on a color-coded scale with labels: green (<0.7), yellow (0.7-0.85), red (>0.85) |
| Optimizer and simulator use different labels for same concept | User confused which tab is "right" | Align terminology: both call it "worker utilization", both use same units |
| Knee point shown without the full curve | User cannot judge if the knee is meaningful | Always show the full cost-vs-stability curve; knee point is a highlight, not the whole output |
| Recommending a config with no "Run in Simulator" CTA | User doesn't validate the recommendation | Prominent "Validate in Simulator" button that copies config and switches tabs |
| Showing M/M/c output as if it predicts cascade timing | User expects to know "when" failure occurs | Label clearly: "Stability prediction (steady-state). For cascade timing, use the Simulator." |
| Exposing all queuing theory parameters | Users who aren't ops engineers are overwhelmed | Derive probe overhead from existing probe config; expose only traffic-facing inputs |
| No units on waiting time output | User doesn't know if "2.3" is ms or seconds | Always suffix units: "2.3 ms avg wait" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Erlang C computation:** Looks correct in normal cases — verify with `c=1, rho=0.99`, `c=20, rho=0.8`, and `c=1, rho=1.01` (must return error/infinity indicator, not NaN)
- [ ] **Probe adjustment:** Model appears to use worker count correctly — verify that probe period and timeout are factored into effective capacity calculation
- [ ] **Knee detection:** Chart shows a knee point — verify by testing with a monotone curve (knee should be absent or flagged, not fabricated)
- [ ] **Tab switching:** Switching to optimizer and back looks fine in dev — verify with a running simulation (engine should still be running, clock advancing after return)
- [ ] **Slow-request modeling:** Optimizer accepts request profiles — verify that a config with 20% slow requests at 10s receives a different stability score than 1% slow at 10s (not identical)
- [ ] **Safety margin:** Recommendation is shown — verify that a ρ=0.9 config shows a warning, not a green checkmark
- [ ] **Optimizer/simulator independence:** Changing optimizer inputs — verify simulator config is unchanged until explicit "apply" action

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Erlang C NaN at high c | LOW | Add `ρ >= 1` guard and switch to iterative form; 1-2 hours |
| Model/simulator divergence confusing users | MEDIUM | Add explanatory copy and explicit framing to UI; existing math is still correct |
| Knee detection false positives | MEDIUM | Replace Kneedle with percentile-threshold fallback for monotone curves; keep Kneedle for curved sections |
| Optimizer state pollutes simulator | HIGH | Requires Zustand store refactor to separate slices; if caught early (Phase 2 start), ~4 hours; if caught after full UI is built, ~1 day |
| Tab switching kills simulation | HIGH | Requires architecture change from conditional render to CSS visibility; if page-level routing was already built around unmounting, may require significant restructuring |
| Bimodal latency mapped to single μ | MEDIUM | Add separate slow-request ρ calculation; surface in UI as additional metric |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Probe-as-worker-consumer ignored (#1) | Phase 1: Math Engine | Unit test: config with `timeoutSeconds < slowLatency` must score as "cascade-prone" |
| Steady-state vs. transient framing (#2) | Phase 1 + Phase 2 UI | UI copy reviewed: optimizer labeled as steady-state screener, not cascade predictor |
| Erlang C numerical instability (#3) | Phase 1: Math Engine | Unit tests at boundary values: c=20, ρ=0.99; no NaN or Infinity in output |
| Optimizer/simulator contradiction (#4) | Phase 2: UI | User test: does the framing make clear why results may differ? |
| Knee detection on bad curves (#5) | Phase 1: Math Engine | Test with monotone curve: knee detection falls back to percentile heuristic |
| Parameter sweep blocking main thread (#6) | Phase 1 + Phase 2 | Profile: drag RPS slider; measure main thread block time < 16ms |
| Bimodal latency to single μ (#7) | Phase 1: Math Engine | Test: 20% slow at 10s must produce higher risk score than 5% slow at 10s |
| Optimizer state coupling (#8) | Phase 2: UI/State | Manual test: change optimizer inputs, verify simulator config unchanged |
| Prescriptive recommendation (#9) | Phase 2: UI | Verify: ρ=0.9 config shows warning; recommendation includes safety margin |
| Tab architecture breaks sim state (#10) | Phase 2: UI | Manual test: start simulation, switch to optimizer, return, verify simulation still running |

---

## Sources

- M/M/c pitfalls and Erlang C numerical instability: [Wikipedia M/M/c queue](https://en.wikipedia.org/wiki/M/M/c_queue), [Erlang C Formula Call Centers (PDF)](https://pdfs.semanticscholar.org/33d4/666e1dabe49ae29e99a69d7d504334b0774e.pdf)
- M/M/c/K finite capacity behavior: [JETIR M/M/C/K paper](https://www.jetir.org/papers/JETIR1806510.pdf), [Springer OPSEARCH railway study](https://link.springer.com/article/10.1007/s12597-025-01041-6)
- Steady-state assumption and bursty arrivals: [Simulation Modeling and Arena — Queuing Formulas](https://rossetti.github.io/RossettiArenaBook/app-qt-sec-formulas.html), [Introduction to Queueing Theory arXiv](https://arxiv.org/pdf/1307.2968)
- Knee point detection pitfalls: [Kneedle paper](https://raghavan.usc.edu/papers/kneedle-simplex11.pdf), [Deep Learning Knee Detection arXiv 2024](https://arxiv.org/html/2409.15608v1), [kneed documentation](https://kneed.readthedocs.io/)
- Optimizer vs. simulation divergence: [Simio — how do you know if something is optimized](https://www.simio.com/how-do-you-know-if-something-is-optimized-if-you-dont-simulate-it/), [MOSIMTEC — simulation vs optimization](https://mosimtec.com/simulation-vs-optimization/)
- React lazy loading and tab patterns: [React code splitting docs](https://legacy.reactjs.org/docs/code-splitting.html), [GreatFrontEnd lazy loading guide](https://www.greatfrontend.com/blog/code-splitting-and-lazy-loading-in-react)
- UX for optimization tools: [ShapeofAI — Parameters pattern](https://www.shapeof.ai/patterns/parameters), [NN/g Design Tradeoffs](https://www.nngroup.com/courses/design-tradeoffs/)
- Queueing theory and utilization misconceptions: [LeSS — Flow and Queueing Theory](https://less.works/less/principles/queueing_theory)

---
*Pitfalls research for: v1.1 Statistical Optimizer — adding queuing theory math to existing discrete event simulator*
*Researched: 2026-04-11*
