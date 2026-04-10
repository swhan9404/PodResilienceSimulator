# Feature Landscape

**Domain:** Discrete event simulation / Kubernetes pod failure modeling / Infrastructure visualization
**Researched:** 2026-04-11
**Overall confidence:** HIGH (spec is detailed, domain is well-defined)

## Domain Context

This tool sits at the intersection of three adjacent domains, borrowing expectations from each:

1. **Discrete Event Simulation (DES) tools** -- SimPy, SimJS, AnyLogic, Arena. Users expect: event scheduling, time control, statistical output, reproducibility.
2. **Infrastructure simulation / chaos engineering** -- KWOK, Kubemark, Litmus Chaos, Chaos Mesh. Users expect: realistic infrastructure modeling, failure injection, observability.
3. **Load testing / capacity planning** -- k6, Locust, Gatling. Users expect: configurable traffic profiles, metric dashboards, threshold detection, report generation.

However, this project is none of those. It is a **visual educational simulator for a specific Kubernetes failure mode**: synchronous worker saturation leading to cascading probe failures. The closest analogy is a **queuing theory simulator with Kubernetes-specific semantics** presented as an interactive visualization. Feature expectations should be calibrated accordingly.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| 1 | **Discrete event simulation engine** | Core mechanism; without accurate event scheduling the simulation is meaningless | High | Priority queue (binary min-heap) + event loop. Must handle 100x speed without drift. |
| 2 | **Pod state machine (READY / NOT_READY / RESTARTING)** | The entire value prop depends on pods transitioning through states correctly | Medium | Well-defined in SPEC; 3 states + transitions |
| 3 | **Synchronous worker model with occupancy** | The *key insight* this tool demonstrates -- workers get locked by slow requests | Medium | Worker pool per pod, exclusive assignment, release on completion |
| 4 | **Backlog queue per pod** | Without backlog modeling, 503s happen too early and the simulation is unrealistic | Low | Bounded FIFO queue, reject when full |
| 5 | **Health check probes competing for workers** | This is THE differentiating insight -- probes must occupy workers like normal requests | Medium | Liveness + readiness probes with period/timeout/failureThreshold/successThreshold |
| 6 | **Configurable parameters panel** | Users need to tweak pod count, workers, backlog size, RPS, probe settings | Medium | Form UI with validation, reasonable defaults matching K8s defaults |
| 7 | **Real-time Canvas pod state visualization** | Users expect to *see* the cascading failure unfold, not just read metrics | High | Canvas 2D rendering of pods, workers, backlog, probe status |
| 8 | **Play / Pause / Speed control (0.5x-100x)** | Standard for any simulation tool | Low | Affects simulation clock advancement per frame |
| 9 | **Request profile configuration** | Users must define multiple request types (normal, slow, very-slow) with latency and ratio | Low | List of {name, latencyMs, ratio, color} entries |
| 10 | **503 rejection tracking** | Core failure signal; without accurate 503 tracking the tool fails its purpose | Low | Counts and surfaces reject events clearly |
| 11 | **Round-robin load balancing across ready pods** | Baseline LB strategy matching real K8s Service behavior | Low | Simple index cycling over ready pods |
| 12 | **Simulation elapsed time display** | Users must know "how long" into the simulation they are | Trivial | Clock display synced to simulation time |
| 13 | **Stop Requests (RPS to 0) for recovery measurement** | Explicit in spec; recovery time measurement is half the tool's value prop | Low | Button that zeros RPS, triggers recovery timer |
| 14 | **End-of-simulation result report** | Users need a summary: when things broke, how bad, how long to recover | Medium | Aggregate metrics: first failure time, total down time, 503 rate, recovery time |

---

## Differentiators

Features that set the product apart. Not expected by default, but provide significant value if present.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| 1 | **Real-time metrics time-series charts** | Transforms from "watch pods" to "understand trends" -- worker usage %, ready pod count, 503 rate, response time over time | Medium | uPlot (545KB) handles this at 100x speed with Canvas rendering |
| 2 | **Per-request-profile response time tracking** | Shows that "normal" requests also suffer when slow requests clog workers | Medium | Track average response time (including queue wait) per profile |
| 3 | **Color-coded request visualization on workers** | Instantly communicates which request types are occupying which workers | Medium | Each worker bar colored by active request's profile color |
| 4 | **Probe history display (recent N results)** | Makes the cascading failure mechanism visible: "3 consecutive failures means restart" | Low | Last N probe results shown per pod as check/cross indicators |
| 5 | **Threshold/tipping point detection** | Auto-identify "at 12.3s, first pod went NotReady" -- saves users from scrubbing | Medium | Event milestone tracking with timestamps |
| 6 | **Deterministic / seeded RNG** | Same seed = same simulation = reproducible results for team discussions | Low | Seedable PRNG (~10 lines), include seed in reports |
| 7 | **Parameter presets matching real K8s defaults** | Pre-fill probe defaults to match actual Kubernetes defaults (period=10, timeout=1, failure=3, success=1) | Trivial | Signals domain credibility |
| 8 | **URL-encoded parameters** | Share a specific configuration via URL -- paste in Slack, team sees exact scenario | Low | Encode params in URL query string or hash |
| 9 | **Config export/import as JSON** | Teams can share "this config kills us in 30s" | Low | Serialize config to JSON file download |

---

## Anti-Features

Features to explicitly NOT build.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| 1 | **Real Kubernetes cluster integration** | Massively increases complexity. The tool's value is in fast, repeatable simulation. | Keep it pure simulation. Users configure parameters to match their real cluster. |
| 2 | **Multi-service / microservice topology** | Modeling service-to-service calls is a different (much harder) problem. | Model a single service's pod pool. |
| 3 | **Async worker model** | Fundamentally different failure mode. Dilutes the focused message about sync worker danger. | Be explicit: "This simulates synchronous workers (gunicorn sync, PHP-FPM)." |
| 4 | **Backend server / API** | Adds deployment complexity, removes "just open the HTML" simplicity. | Pure SPA. All simulation in browser. |
| 5 | **Persistent storage / database** | No need for server-side history. | localStorage for recent configs at most. |
| 6 | **User accounts / authentication** | This is a dev/ops tool, not a SaaS product. | No auth. Anyone with URL can use it. |
| 7 | **Network latency / bandwidth simulation** | Orthogonal to sync-worker-saturation story. | Assume network is instant. Focus on worker occupancy. |
| 8 | **Auto-scaling (HPA) simulation** | Substantial complexity (scaling decisions, cool-down). Phase 2 feature at best. | Document that pod count is static. |
| 9 | **CPU / memory resource modeling** | Separate failure modes. Mixing muddies the lesson. | Focus purely on worker/backlog/probe mechanics. |
| 10 | **Comparison mode (A/B side-by-side)** | High complexity for MVP. | Users run two separate simulations and compare manually. |
| 11 | **Mobile-responsive design** | This is a desktop power tool. Canvas needs screen real estate. | Target 1280px+ viewports. |
| 12 | **Web Workers for simulation** | MessagePort serialization overhead, shared state complexity. Main thread is fast enough for this scale. | Run engine on main thread. Reconsider only if profiling shows >5ms per step. |

---

## Feature Dependencies

```
                    +------------------+
                    |  DES Engine       | <-- Foundation; everything depends on this
                    |  (event queue,    |
                    |   clock, step)    |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
     +------------+  +------------+  +--------------+
     | Pod State   |  | Request    |  | Load Balancer|
     | Machine     |  | Generator  |  |              |
     +------+-----+  +-----+------+  +------+-------+
            |               |                |
            v               v                v
     +------------+  +----------------------------+
     | Worker     |  | Request Routing + Backlog   |
     | Model      |  | (uses LB, assigns workers)  |
     +------+-----+  +------------+----------------+
            |                     |
            v                     v
     +------------+        +--------------+
     | Probe      |        | 503 Tracking |
     | System     |        |              |
     +------+-----+        +------+-------+
            |                     |
            v                     v
     +------------------------------------+
     | Metrics Collector                  |
     +----------------+-------------------+
                      |
         +------------+---------------+
         v            v               v
  +-----------+ +----------+  +------------+
  | Canvas    | | Charts   |  | Result     |
  | Viz       | | (uPlot)  |  | Report     |
  +-----------+ +----------+  +------------+
```

---

## MVP Recommendation

### Phase 1: Core Simulation (must ship first)

1. **DES Engine** -- event queue + clock + step loop
2. **Pod State Machine** -- READY / NOT_READY / RESTARTING transitions
3. **Worker Model** -- synchronous occupancy
4. **Backlog Queue** -- bounded per pod, 503 on overflow
5. **Probe System** -- liveness + readiness competing for workers
6. **Request Generator** -- configurable RPS with request profiles
7. **Round-Robin Load Balancer** -- distribute across ready pods

All testable headlessly with Vitest before any UI.

### Phase 2: Visualization + Controls

8. **Canvas Pod Visualization** -- see pods, workers, backlog, probe status
9. **Parameter Panel** -- form to configure all settings
10. **Play / Pause / Speed Controls** -- simulation control
11. **Stop Requests Button** -- recovery measurement
12. **Elapsed Time + 503 Count Display**

### Phase 3: Charts + Reporting

13. **Time-Series Metrics Charts** (uPlot) -- worker usage, ready pods, 503 rate
14. **Result Report** -- summary after simulation ends
15. **Per-Profile Response Time** -- breakdown by request type

### Defer

- URL-encoded parameters, config export/import -- nice-to-have polish
- Comparison mode, sensitivity analysis -- high complexity, do manually
- Preset scenarios -- add after core is solid

---

## Sources

- Project SPEC.md and PROJECT.md (primary requirements source)
- Training data knowledge of: SimPy, KWOK, Kubemark, Chaos Mesh, k6, Locust (adjacent domain tools)
- Kubernetes probe documentation (kubernetes.io)
- Note: WebSearch unavailable. Feature landscape based on spec + domain knowledge. Core domain (DES, K8s probes, sync workers) is stable and well-established.
