# Domain Pitfalls

**Domain:** Browser-based discrete event simulation with Canvas visualization for EKS synchronous worker pod failure modeling
**Researched:** 2026-04-11
**Confidence:** HIGH (based on established patterns in simulation engineering, Canvas rendering, and Kubernetes operations)

---

## Critical Pitfalls

Mistakes that cause rewrites, incorrect simulation results, or unusable performance.

---

### Pitfall 1: Simulation Time vs. Wall Clock Time Conflation

**What goes wrong:** The simulation engine mixes real elapsed time (`performance.now()`) with simulation-logical time. At 100x speed, events scheduled in simulation-time get compared against wall-clock time somewhere in the pipeline. Probes fire at wrong intervals, request latencies are incorrect, cascading failure timings become unreproducible.

**Why it happens:** `requestAnimationFrame` provides wall-clock delta. When speed multiplier is applied, some code paths still operate on wall-clock time. The two time domains bleed into each other.

**Consequences:** Simulation produces different results at different speeds. A scenario at 1x might cascade at 45s but at 100x shows cascade at 38s. Users lose trust in the tool. The bug is subtle -- results look plausible but are wrong.

**Prevention:**
1. Establish a single `SimulationClock` that is the ONLY source of "current time" for all simulation logic. No simulation code ever calls `Date.now()` or `performance.now()`.
2. The RAF loop computes `simDelta = wallDelta * speed` and passes it to `engine.step(simDelta)`.
3. All events in the priority queue are keyed on simulation time, never wall time.
4. Write deterministic tests: same seed + same parameters must produce identical event sequences regardless of speed. Run the same scenario at 1x, 10x, 100x and assert identical event logs.

**Detection:** Debug mode that logs every event with both simTime and wallTime. If simTime deltas between events don't match expected values, the conflation exists.

**Phase:** Must be addressed in Phase 1 (simulation engine core). Retrofitting time discipline is a rewrite.

---

### Pitfall 2: Priority Queue Degeneracy at High Speed

**What goes wrong:** At 100x speed with 100 RPS, the engine must process 10,000+ request arrivals per real second. A naive array-based priority queue with O(n) insertion causes frame drops and browser tab freezes.

**Why it happens:** Many tutorials implement priority queues as sorted arrays. At high speed multiplier, the queue grows to thousands of pending events. Each insertion scans/shifts the array. GC pressure from frequent resizing compounds the problem.

**Consequences:** At 50x-100x speed, the simulation becomes unresponsive -- exactly when users need it most.

**Prevention:**
1. Use a binary heap (min-heap). Insertion and extraction are O(log n). Non-negotiable.
2. Pre-allocate the heap array to ~10,000 slots to avoid GC from resizing.
3. Event cancellation via "tombstone" pattern (mark cancelled, skip on pop) to avoid O(n) removal.
4. Batch event processing: advance all events up to target time in a tight loop, only snapshot for rendering after the batch.

**Detection:** Chrome DevTools Performance tab at 100x speed with 100 RPS. If `engine.step()` exceeds 8ms per frame, the queue is the bottleneck.

**Phase:** Phase 1 (engine core). The priority queue is foundational.

---

### Pitfall 3: Probe Timing Model Inaccuracy

**What goes wrong:** The health check probe model doesn't faithfully replicate Kubernetes behavior. Common mistakes:
- Probes fire on a fixed timer regardless of whether previous probe completed (correct K8s: next probe starts `periodSeconds` after the previous completes/times out)
- Probe timeout starts from when a worker picks it up, not from when it was sent (in reality: timeout starts at send time, backlog wait counts)
- Forgetting that probes don't fire during initialization / restart period

**Why it happens:** K8s probe behavior has edge cases not obvious from documentation summaries.

**Consequences:** The simulator shows a pod restarting at 35s, but in real EKS it would restart at 50s. The core value -- predicting cascading failure timing -- becomes unreliable.

**Prevention:**
1. After a probe completes or times out, schedule NEXT probe at `currentSimTime + periodSeconds * 1000`. This matches kubelet behavior.
2. Probe timeout: start from when the probe event is created (simulating HTTP request sent), NOT from when a worker picks it up.
3. If probe sits in backlog longer than timeoutSeconds, it's a failure regardless.
4. If backlog is full when probe arrives, immediate failure (not even queued).
5. On pod restart, cancel all pending probe events. After initializeTime, schedule fresh probes.
6. Validate against manual calculation with deterministic parameters.

**Detection:** Test scenario with no randomness. Hand-calculate exact time of first probe failure, first restart, total outage. Simulation must match within 1ms.

**Phase:** Phase 1 (engine core). The probe model is the heart of the cascading failure mechanism.

---

### Pitfall 4: React State Synchronization with Simulation Engine

**What goes wrong:** The bridge between engine state and React components is mishandled:
- `useState` for simulation state causes entire tree to re-render at 60fps
- `useRef` avoids re-renders but React components don't update when they should
- Zustand store updates trigger re-renders for parameter panel even when only simulation state changed
- Metrics chart component subscribes to simulation state, triggering 60fps chart re-renders

**Why it happens:** React's reactive model fundamentally conflicts with a high-frequency imperative simulation loop.

**Consequences:** Either the UI is unresponsive (too many re-renders) or stale (not enough). Both destroy UX.

**Prevention:**
Three-tier state architecture:
1. **Tier 1 (Engine state):** Pure TypeScript classes, no React. Updated thousands of times per second. Never in React state.
2. **Tier 2 (Render snapshot):** Plain object created once per frame. Passed to Canvas renderer imperatively (not via React props).
3. **Tier 3 (React UI state):** Only for user inputs (Zustand 5), playback controls, post-simulation results. Updated on user action or at throttled intervals (~20Hz), NOT every frame.

Canvas renders via ref, not state. Metrics charts (uPlot) updated imperatively via `setData()`, not via React props. Use `React.memo` on parameter panel, controls, and result report.

**Detection:** React DevTools Profiler. If any component re-renders more than once per user interaction (excluding Canvas), the bridge is leaking simulation state into React.

**Phase:** Phase 1 (architecture decision) + Phase 2 (implementation).

---

### Pitfall 5: Event Queue Overflow from Cascading Event Generation

**What goes wrong:** During cascading failure, a pod restart drops all in-progress requests and backlog. If 10 pods restart simultaneously (4 workers + 10 backlog = 14 requests each), that's 140 requests dropped instantly, each potentially generating events. Meanwhile, new arrivals keep coming at 100 RPS. The event queue balloons.

**Why it happens:** The discrete event model naturally amplifies during state transitions. Each state change triggers multiple consequent events.

**Consequences:** Memory spikes during the most interesting part of the simulation. Browser tab may run out of memory. Visualization freezes at the critical moment.

**Prevention:**
1. On pod restart, bulk-clear workers and backlog. Record a single `pod_restarted` event with metadata (`{droppedRequests: 14}`). Don't generate individual "request dropped" events.
2. Event handlers should modify state directly, not by enqueueing chains of intermediate events.
3. Monitor queue depth. If it grows monotonically, there's a leak.
4. Set a max events-per-step limit (e.g., 50,000) as safety valve.

**Detection:** Stress test: 20 pods, 4 workers, RPS=200, 100x speed. Monitor `eventQueue.size()`. Healthy: fluctuates around stable mean. Unhealthy: monotonic growth.

**Phase:** Phase 1 (engine design).

---

## Moderate Pitfalls

---

### Pitfall 6: Floating Point Time Accumulation Drift

**What goes wrong:** Simulation time accumulated as `simTime += deltaMs * speed`. After 6,000,000 simulated ms, floating point errors can be 0.1-1ms. Probe events at exact multiples of `periodSeconds` fire slightly early/late, causing off-by-one in failure threshold counting.

**Prevention:**
1. Use integer milliseconds for simulation time. JS numbers are doubles -- integers up to 2^53 are exact.
2. Event scheduling: compute absolute times from base times (`lastProbeTime + periodSeconds * 1000`), not by adding to accumulated simTime.
3. Request arrivals: pre-compute as `baseTime + (i * intervalMs)`.

**Phase:** Phase 1 (engine core). Integer time discipline from the start.

---

### Pitfall 7: Round-Robin LB Index Corruption on Pod State Changes

**What goes wrong:** When pods transition Ready/Not-Ready, the ready pod set changes. RR index doesn't adjust, causing uneven distribution that accelerates cascading failure on some pods.

**Prevention:**
1. Reset index to 0 when ready-set composition changes.
2. Or iterate through sorted pod IDs (closer to real kube-proxy behavior).
3. Document LB behavior so users understand the model.

**Phase:** Phase 1 (engine core).

---

### Pitfall 8: Metrics Chart Memory Growth

**What goes wrong:** At 100x speed, 5 min real session = 500 min simulated = 300,000 data points per metric if sampling every 100ms. uPlot and the browser choke on this.

**Prevention:**
1. Adaptive sampling: at 1x sample every 100ms sim-time, at 100x sample every 1000ms. Real data points/second stays constant.
2. Ring buffer: keep last N data points (e.g., 2,000) at full resolution. Older points downsampled.
3. uPlot handles large datasets well, but bounded input is still best practice.

**Phase:** Phase 2 (metrics/visualization). Plan the ring buffer structure in Phase 1.

---

### Pitfall 9: Incorrect Request Handling on Pod State Transitions

**What goes wrong:** Developers conflate "removed from load balancer" (NOT_READY) with "stopped working." In reality:
- **NOT_READY:** No new requests from LB, but existing workers continue, backlog drains normally.
- **RESTARTING:** All workers cleared, all backlog dropped, initializeTime countdown begins.

Getting this wrong makes recovery look faster than reality, making users overconfident.

**Prevention:**
1. Implement exactly as SPEC: NOT_READY = no new requests, existing work continues. RESTARTING = hard reset.
2. Write explicit tests: Pod with 4 busy workers goes Not-Ready. Workers must complete normally. Only liveness failure triggers the hard reset.

**Phase:** Phase 1 (pod state machine).

---

### Pitfall 10: requestAnimationFrame Starvation Under Load

**What goes wrong:** At high speed, `engine.step()` hogs the main thread. UI controls (speed slider, pause, "stop requests") become unresponsive. At the critical moment when user needs to click "Stop Requests," the button doesn't respond for 200-500ms.

**Prevention:**
1. Time-boxed advance: process events for at most 8ms wall time per frame. Continue in next frame if needed.
2. After processing, check `performance.now()` elapsed. If >12ms, break and yield for input events.

**Phase:** Phase 2 (performance). Design the `maxAdvanceWallMs` parameter in Phase 1.

---

### Pitfall 11: Determinism Loss from Math.random()

**What goes wrong:** Request profiles assigned via `Math.random()`. Every run produces different results. Users can't reproduce specific failure scenarios.

**Prevention:**
1. Seedable PRNG (e.g., `mulberry32` -- ~10 lines of code).
2. Default seed displayed in UI, user-changeable.
3. ALL random decisions use the seeded PRNG, never `Math.random()`.
4. Include seed in result reports.

**Phase:** Phase 1 (engine core). Must be in place before any random decisions.

---

## Minor Pitfalls

---

### Pitfall 12: Canvas DPI Scaling (Retina/HiDPI)

**What goes wrong:** On Retina displays, Canvas renders at 1x resolution, causing blurry text and lines.

**Prevention:** Set canvas dimensions to `width * devicePixelRatio`, scale context with `ctx.scale(dpr, dpr)`, apply CSS dimensions at 1x. Must be done from the start.

**Phase:** Phase 2 (visualization).

---

### Pitfall 13: Speed Change Mid-Simulation Jump

**What goes wrong:** Speed change from 10x to 100x causes a one-frame jump where too many events process, or 100x to 1x has a stutter.

**Prevention:** Speed changes take effect next frame. Time-boxed advance pattern handles sudden increases.

**Phase:** Phase 1 (engine control).

---

### Pitfall 14: Parameter Validation Gaps

**What goes wrong:** `workersPerPod: 0`, `rps: 0`, `timeoutSeconds > periodSeconds` (rapid restart loop), `ratio` values not summing to 1.0. Simulation enters degenerate states.

**Prevention:**
1. Validate all parameters before simulation start.
2. Warn but allow degenerate configs like timeout > period (these create interesting failure modes).
3. Normalize ratio values to sum to 1.0.
4. Minimums: `workersPerPod >= 1`, `podCount >= 1`.

**Phase:** Phase 2 (UI) + engine-level assertions.

---

### Pitfall 15: Backlog Queue Ordering / Probe Priority

**What goes wrong:** Backlog accidentally uses stack (LIFO) instead of queue (FIFO), or probes get priority over regular requests (separate queue, front-of-line insertion). Both make simulation diverge from real gunicorn behavior.

**Prevention:** FIFO queue. Probes go into the same FIFO backlog as regular requests. No priority. No separate queue. This matches real sync worker behavior.

**Phase:** Phase 1.

---

### Pitfall 16: uPlot React Integration Lifecycle

**What goes wrong:** uPlot instance created inside React render, destroyed/recreated on every state update. Or uPlot not properly cleaned up on component unmount, causing memory leaks.

**Prevention:**
1. Use `uplot-react` wrapper (1.2.4) which handles lifecycle correctly.
2. If writing custom hook: create uPlot in `useEffect`, destroy in cleanup. Never recreate on data updates -- use `uPlot.setData()` instead.
3. Resize handling: listen for `ResizeObserver` on container, call `uPlot.setSize()`.

**Phase:** Phase 2 (charts).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Simulation Engine Core | Time conflation (#1), Queue performance (#2), Probe model (#3), Event overflow (#5), Float drift (#6), Determinism (#11) | Integer sim-time, binary heap, seedable PRNG, probe scheduling rules as foundational decisions. Deterministic tests before visualization. |
| Pod State Machine | State transition errors (#9), Backlog ordering (#15) | Exhaustive state transition tests. NOT_READY vs RESTARTING semantics verified explicitly. |
| Canvas Visualization | DPI scaling (#12) | Handle devicePixelRatio from day one. |
| React Integration | State synchronization (#4), RAF starvation (#10) | Three-tier state. Canvas via ref. Time-box engine advances. |
| Metrics & Charts | Memory growth (#8), uPlot lifecycle (#16) | Ring buffer with adaptive sampling. Use uplot-react wrapper. |
| Speed Control | Speed change jumps (#13), High-speed queue load (#2) | Time-boxed advance, speed change on next frame. |
| User Input | Parameter validation (#14), LB index (#7) | Input validation layer, documented LB behavior. |

---

## Sources

- Discrete event simulation patterns: established computer science (HIGH confidence)
- Canvas rendering optimization: MDN Web Docs Canvas performance guidelines (HIGH confidence)
- Kubernetes probe behavior: official K8s documentation on liveness/readiness probes (HIGH confidence)
- React rendering model: React 19 documentation (HIGH confidence)
- uPlot lifecycle: npm registry verified version 1.6.32, uplot-react 1.2.4 (HIGH confidence)
- Priority queue implementations: standard data structures (HIGH confidence)
