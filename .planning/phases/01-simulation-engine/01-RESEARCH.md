# Phase 1: Simulation Engine - Research

**Researched:** 2026-04-11
**Domain:** Headless discrete event simulation engine in pure TypeScript
**Confidence:** HIGH

## Summary

Phase 1 builds the headless simulation engine -- a pure TypeScript discrete event simulation (DES) core with no UI/DOM/Canvas dependencies. The engine models EKS synchronous worker pods under slow request load: event queue (binary min-heap), pod state machine (READY/NOT_READY/RESTARTING), synchronous workers with backlog queues, liveness/readiness health check probes, round-robin load balancer, and a metrics collector. All verifiable through Vitest unit tests.

The domain is well-understood (DES is textbook computer science, K8s probe behavior is well-documented). The primary risk is not technology but correctness: getting probe timing, state transitions, and event ordering exactly right. The implementation is ~40-line min-heap + ~500-line engine + ~200-line pod state machine + ~100-line load balancer + ~150-line metrics collector, all pure TypeScript with zero external runtime dependencies.

**Primary recommendation:** Build bottom-up following the dependency graph (types -> priority-queue -> worker/LB/metrics -> pod -> engine), with deterministic tests at each layer. Use integer milliseconds for all simulation time. Implement a seedable PRNG (mulberry32, ~10 lines) for request profile selection to ensure reproducible simulations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Integer millisecond simulation clock, fully decoupled from wall clock
- **D-02:** Binary min-heap priority queue for event scheduling (sorted array forbidden)
- **D-03:** Self-scheduling event pattern -- each event schedules its next occurrence
- **D-04:** Pod 3-state machine: READY -> NOT_READY -> RESTARTING
- **D-05:** Pod restart drops all in-progress requests and backlog (lost, not re-queued)
- **D-06:** After initializeTime, probes resume; after successThreshold met, READY restored
- **D-07:** Probes occupy a worker slot (same path as regular requests). Probe processing time = 1ms
- **D-08:** Next probe fires periodSeconds after previous probe completes/times out (not fixed interval)
- **D-09:** If backlog is full when probe arrives, immediate failure (no timeout wait)
- **D-10:** Round-robin to READY pods only. Strategy pattern interface, but only RR implemented
- **D-11:** All pods Not Ready -> immediate 503
- **D-12:** Engine provides immutable snapshot method for Phase 2 consumption

### Claude's Discretion
- Request arrival pattern (Poisson vs Uniform)
- Metrics collection approach (per-event vs time-window)
- Restart-dropped request counting

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIM-01 | DES engine with event queue (min-heap) and simulation clock | Min-heap implementation pattern, engine.step() design |
| SIM-02 | Request arrival events generated at configured RPS | Self-scheduling REQUEST_ARRIVAL pattern, arrival interval calculation |
| SIM-03 | Each request's processing time determined by request profile ratios | Seedable PRNG for profile selection, weighted random |
| SIM-04 | Integer millisecond logical time, decoupled from wall clock | Integer time discipline, SimulationClock design |
| POD-01 | Pod states: READY / NOT_READY / RESTARTING | Pod state machine enum + transition table |
| POD-02 | N synchronous workers per pod, occupied during request processing | Fixed-size worker slot array pattern |
| POD-03 | Requests queue in backlog when no idle workers | FIFO backlog queue on Pod |
| POD-04 | Backlog full -> request rejected as 503 | Pod.tryAccept() returns reject result |
| POD-05 | Pod restart drops all in-progress requests and backlog | Bulk clear on restart, single metric event |
| POD-06 | Restart -> initializeTime wait -> Not Ready + Not Live | PodInitComplete event scheduling |
| HC-01 | Liveness probe at periodSeconds intervals, occupies worker | Probe-as-request pattern, self-scheduling |
| HC-02 | Readiness probe at periodSeconds intervals, occupies worker | Same probe-as-request pattern |
| HC-03 | Probe timeout if no response within timeoutSeconds | PROBE_TIMEOUT event at send_time + timeoutSeconds |
| HC-04 | Backlog full -> probe immediate failure | Pod.tryAccept() special case for probes |
| HC-05 | Liveness consecutive failureThreshold -> pod restart | ProbeCounter tracking, threshold check in event handler |
| HC-06 | Readiness consecutive failureThreshold -> LB removal | ProbeCounter tracking, pod state transition |
| HC-07 | Consecutive successThreshold -> Ready state restored | ProbeCounter tracking, pod state transition |
| HC-08 | Next probe after previous completes/times out + periodSeconds | Self-scheduling probe pattern (D-08) |
| LB-01 | Round-robin to READY pods only | LoadBalancer with ready-pod filtering |
| LB-02 | All pods Not Ready -> 503 | LoadBalancer returns null/503 |
| LB-03 | LB strategy abstracted as interface | LoadBalancerStrategy interface + RoundRobinStrategy |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack:** React + TypeScript + Vite + Canvas -- browser-only SPA
- **Performance:** Simulation/rendering separation mandatory for 100x speed
- **No Server:** Static SPA deployment
- **Simplicity First:** Minimum code, no speculative features, no unnecessary abstractions
- **Surgical Changes:** Touch only what's needed
- **Goal-Driven:** Define success criteria, loop until verified
- **Testing:** Run test suite after changes, fix failures before presenting as complete
- **TypeScript 5.7.x** (not 6.0) -- conservative stability choice [VERIFIED: npm registry shows 5.7.3 as latest 5.7.x]
- **Vitest 4.1.4** for unit testing [VERIFIED: npm registry]
- **Simulation engine outside React** -- pure TS classes, zero framework imports

## Standard Stack

### Core (Phase 1 Only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.7.3 | Type safety for simulation engine | Battle-tested, ecosystem compatible. TS 6.0.2 available but intentionally avoided per project decision [VERIFIED: npm registry] |
| Vitest | 4.1.4 | Unit testing simulation logic | Native Vite integration, same transforms, `environment: 'node'` for pure TS tests [VERIFIED: npm registry] |
| Vite | 8.0.8 | Build tool (project scaffold) | Mandated by spec, needed even for Phase 1 to set up the project [VERIFIED: npm registry] |

### Not Needed in Phase 1

| Library | Why Deferred |
|---------|-------------|
| React / React DOM | No UI in Phase 1 -- engine is headless |
| Zustand | UI state only -- simulation state is plain TS classes |
| uPlot | Charts are Phase 2 |
| Tailwind CSS | Styling is Phase 2+ |
| heap-js or any PQ library | Custom ~40-line min-heap is simpler and avoids dependency for critical data structure [ASSUMED -- standard practice for small heaps] |
| rand-seed | Custom mulberry32 is ~10 lines, avoids dependency [CITED: github.com/cprosche/mulberry32] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom min-heap | `heap-js` npm package | heap-js is well-tested but adds a dependency for ~40 lines of code. Custom is simpler for this project's scale (~500 max events). |
| Custom mulberry32 | `rand-seed` npm package | rand-seed adds TypeScript types and multiple algorithms. Overkill -- we need one 10-line function. |
| Vitest | Jest | Jest requires separate transform config. Vitest shares Vite config natively. |

**Installation (Phase 1):**
```bash
# Scaffold project
npm create vite@latest slow-request-simulator -- --template react-ts

# Dev dependencies only needed for Phase 1
npm install -D typescript@~5.7 vitest@^4.1

# Note: React, Tailwind, etc. will be installed but not used until Phase 2+
```

## Architecture Patterns

### Recommended Project Structure (Phase 1 files)

```
src/
  simulation/
    types.ts              # SimEvent, PodState, SimulationConfig, EventType, etc.
    priority-queue.ts     # MinHeap<T> -- binary min-heap (~40 lines)
    rng.ts                # Seedable PRNG (mulberry32, ~10 lines)
    worker.ts             # Worker slot model (occupied/idle + busy-until)
    pod.ts                # Pod state machine + workers + backlog
    load-balancer.ts      # Strategy interface + RoundRobinStrategy
    metrics.ts            # MetricsCollector -- time-window sampling
    engine.ts             # SimulationEngine -- DES core, event loop, snapshot
  __tests__/              # or colocated .test.ts files
    priority-queue.test.ts
    pod.test.ts
    load-balancer.test.ts
    engine.test.ts        # Integration/scenario tests
```

### Pattern 1: Event-Driven Discrete Event Simulation

**What:** Priority queue of events ordered by simulation time. Engine processes events in time order, jumping from event to event (not stepping in fixed increments). Each event handler may enqueue new events. [VERIFIED: standard DES pattern from computer science]

**When to use:** Always -- this is the core simulation pattern.

**Example:**
```typescript
// Source: .planning/research/ARCHITECTURE.md (project canonical reference)
class SimulationEngine {
  private clock: number = 0;  // integer milliseconds
  private eventQueue: MinHeap<SimEvent>;

  step(deltaMs: number): void {
    const targetTime = this.clock + deltaMs;
    while (!this.eventQueue.isEmpty() && this.eventQueue.peek().time <= targetTime) {
      const event = this.eventQueue.pop();
      this.clock = event.time;
      this.processEvent(event);
    }
    this.clock = targetTime;
  }
}
```

### Pattern 2: Self-Scheduling Events (D-03)

**What:** Each event handler schedules the next occurrence of its own type. REQUEST_ARRIVAL schedules the next REQUEST_ARRIVAL. LIVENESS_PROBE schedules the next LIVENESS_PROBE after completion. [VERIFIED: standard DES self-scheduling pattern]

**When to use:** For all recurring events (request arrivals, probes).

**Example:**
```typescript
// Source: .planning/research/ARCHITECTURE.md
case 'REQUEST_ARRIVAL':
  this.handleRequestArrival(event);
  if (this.rps > 0) {
    const intervalMs = Math.round(1000 / this.rps);
    this.eventQueue.push({
      time: this.clock + intervalMs,
      type: 'REQUEST_ARRIVAL',
      payload: this.generateRequest(),
    });
  }
  break;
```

### Pattern 3: Probe as Regular Request (D-07)

**What:** Probes compete for workers and backlog space exactly like user requests. Only differences: 1ms processing time, timeout evaluation, threshold counting. This is the core insight -- cascading failure happens because probes compete with slow requests. [VERIFIED: matches K8s kubelet behavior where probes are HTTP requests to the same endpoint]

**When to use:** All probe handling.

### Pattern 4: Snapshot-Based State Export (D-12)

**What:** Engine produces a plain readonly object representing current state. No structural sharing, no deep freeze -- just create a fresh object. At <20 pods, creation cost is negligible. [VERIFIED: standard pattern from .planning/research/ARCHITECTURE.md]

**Example:**
```typescript
// Source: .planning/research/ARCHITECTURE.md
interface SimulationSnapshot {
  clock: number;
  pods: PodSnapshot[];
  stats: {
    totalRequests: number;
    total503s: number;
    readyPodCount: number;
    activeWorkerCount: number;
    totalWorkerCount: number;
  };
  metrics: MetricsSample[];
  phase: 'running' | 'stopped_requests' | 'recovered' | 'finished';
}
```

### Anti-Patterns to Avoid

- **Fixed time-step simulation:** Advancing by 1ms increments at 100x speed = 30,000,000 iterations for 5 minutes. Browser freezes. Use event-driven stepping instead. [CITED: .planning/research/PITFALLS.md Pitfall #2]
- **React state for simulation data:** Engine state must be plain TS classes, never in useState/Zustand during Phase 1. [CITED: .planning/research/ARCHITECTURE.md Anti-Pattern #1]
- **Sorted array for event queue:** O(n) insertion vs O(log n) for heap. At 100x speed with 100 RPS, this causes frame drops. [CITED: .planning/research/PITFALLS.md Pitfall #2]
- **Individual events for bulk operations:** On pod restart, bulk-clear workers and backlog. Record one metric event, not 14 separate "request dropped" events. [CITED: .planning/research/PITFALLS.md Pitfall #5]
- **Floating-point time accumulation:** Use integer milliseconds exclusively. Compute absolute times from base times, not by adding to accumulated simTime. [CITED: .planning/research/PITFALLS.md Pitfall #6]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test framework | Custom test runner | Vitest 4.1.4 | Native Vite integration, assertions, mocking built in |
| Complex state management | Observable/reactive engine | Plain TS classes + snapshot pattern | Engine runs outside React; observability is unnecessary overhead |

**Key insight:** For Phase 1, almost everything SHOULD be hand-rolled because the simulation engine is domain-specific. The min-heap, PRNG, pod state machine, and event handlers are all simple enough that libraries add more complexity than they save. The only external tool is Vitest for testing.

## Common Pitfalls

### Pitfall 1: Simulation Time vs Wall Clock Conflation
**What goes wrong:** Simulation engine accidentally uses `Date.now()` or `performance.now()` somewhere in event scheduling. At different speeds, simulation produces different results.
**Why it happens:** Natural habit to reach for system time. RAF callback provides wall-clock delta.
**How to avoid:** Single `clock` field is the ONLY time source for all simulation logic. No `Date.now()` or `performance.now()` anywhere in `src/simulation/`. Deterministic tests: same config must produce identical event sequences regardless of speed.
**Warning signs:** Test results that change between runs, or that differ at 1x vs 100x speed.
[CITED: .planning/research/PITFALLS.md Pitfall #1]

### Pitfall 2: Probe Timeout Starts at Wrong Time
**What goes wrong:** Timeout measured from when worker picks up probe (dequeue time) instead of when probe was sent (enqueue time). Backlog wait time doesn't count toward timeout.
**Why it happens:** Intuition says "timeout starts when processing starts," but K8s timeout starts when kubelet sends the HTTP request.
**How to avoid:** Schedule PROBE_TIMEOUT event at `probe_send_time + timeoutSeconds * 1000`. If probe completes before timeout event fires, cancel the timeout. If probe is still in backlog when timeout fires, it's a failure.
**Warning signs:** Probes in backlog never timing out. Pods staying READY under load that should cause failure.
[CITED: .planning/research/PITFALLS.md Pitfall #3, SPEC.md probe detail]

### Pitfall 3: NOT_READY vs RESTARTING Confusion
**What goes wrong:** NOT_READY treated as "stop all work." In reality: NOT_READY = no new requests from LB, but existing workers continue processing. RESTARTING = hard reset, all work dropped.
**Why it happens:** Both states sound like "pod is broken."
**How to avoid:** Explicit tests: Pod with 4 busy workers goes NOT_READY -> workers must complete normally. Only liveness failureThreshold triggers RESTARTING (hard reset).
**Warning signs:** Recovery looks faster than expected because existing requests are prematurely dropped.
[CITED: .planning/research/PITFALLS.md Pitfall #9]

### Pitfall 4: Round-Robin Index Corruption on Pod State Changes
**What goes wrong:** When pods enter/leave READY state, the RR index doesn't adjust. Some pods get disproportionate traffic, accelerating cascade.
**Why it happens:** RR index maintained as simple counter modulo pod count. Ready-set composition changes but index doesn't reset.
**How to avoid:** RR iterates over the current ready-pod list. Index resets to 0 (or wraps) when ready-set composition changes.
**Warning signs:** Uneven request distribution visible in per-pod metrics.
[CITED: .planning/research/PITFALLS.md Pitfall #7]

### Pitfall 5: Backlog Queue Using LIFO Instead of FIFO
**What goes wrong:** Backlog accidentally implemented as stack. Last-in requests served first, older requests (including probes) starve.
**Why it happens:** Array.push() + Array.pop() is LIFO. Need Array.push() + Array.shift() (or proper ring buffer).
**How to avoid:** Use explicit FIFO queue. Probes go into the same FIFO as regular requests -- no priority, no separate queue. This matches real sync worker (gunicorn) behavior.
**Warning signs:** Probes succeed when they should fail because they were pushed after slow requests but popped before them.
[CITED: .planning/research/PITFALLS.md Pitfall #15]

### Pitfall 6: Event Queue Overflow During Cascading Restart
**What goes wrong:** Multiple pods restart simultaneously. Each drops 14+ requests. New arrivals keep coming. Queue balloons.
**Why it happens:** DES naturally amplifies during state transitions.
**How to avoid:** Bulk-clear on restart with single metric event. Don't generate individual "request dropped" events. Monitor queue depth in stress tests.
**Warning signs:** Memory spikes during cascading failure, queue size monotonically increasing.
[CITED: .planning/research/PITFALLS.md Pitfall #5]

## Code Examples

### Binary Min-Heap Implementation

```typescript
// Source: standard binary heap data structure [VERIFIED: textbook CS]
// ~40 lines, no dependencies
class MinHeap<T> {
  private items: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number { return this.items.length; }
  isEmpty(): boolean { return this.items.length === 0; }
  peek(): T { return this.items[0]; }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.items[i], this.items[parent]) >= 0) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.items.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}
```

### Seedable PRNG (Mulberry32)

```typescript
// Source: github.com/cprosche/mulberry32 [CITED: docs]
// Returns a function that produces numbers in [0, 1)
function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### Pod State Machine Skeleton

```typescript
// Source: SPEC.md state diagram + CONTEXT.md decisions
enum PodState {
  READY = 'READY',
  NOT_READY = 'NOT_READY',
  RESTARTING = 'RESTARTING',
}

interface ProbeCounter {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

// Pod.tryAccept() return type
type AcceptResult =
  | { status: 'assigned'; workerIndex: number }
  | { status: 'queued' }
  | { status: 'rejected' };  // 503 or immediate probe failure
```

### Event Types

```typescript
// Source: SPEC.md event list + ARCHITECTURE.md
type EventType =
  | 'REQUEST_ARRIVAL'      // New request from generator
  | 'REQUEST_COMPLETE'     // Worker finishes processing
  | 'LIVENESS_PROBE'       // Liveness probe fires
  | 'READINESS_PROBE'      // Readiness probe fires
  | 'PROBE_TIMEOUT'        // Probe exceeded timeoutSeconds
  | 'PROBE_COMPLETE'       // Probe worker finished (1ms processing)
  | 'POD_RESTART'          // Liveness threshold exceeded -> restart
  | 'POD_INIT_COMPLETE';   // initializeTime elapsed -> probes resume

interface SimEvent {
  time: number;         // Simulation time in integer ms
  type: EventType;
  podId?: number;       // Target pod (for pod-specific events)
  requestId?: number;   // For request tracking
  probeType?: 'liveness' | 'readiness';  // For probe events
}
```

## Discretionary Decisions (Research Recommendations)

### Request Arrival Pattern: Uniform Interval (Not Poisson)

**Recommendation:** Use uniform (deterministic) intervals: `intervalMs = Math.round(1000 / rps)`. [ASSUMED -- engineering judgment]

**Rationale:**
- The simulator's goal is demonstrating cascading failure mechanics, not modeling realistic traffic patterns. Uniform arrival makes results fully deterministic and reproducible.
- Poisson interarrivals add randomness that makes it harder to verify exact timing in tests (e.g., "100% slow requests cause cascade within bounded time" is harder to assert with random arrivals).
- If Poisson is desired later, it's a simple change: replace `intervalMs` with `-Math.log(1 - rng()) * (1000 / rps)`. The self-scheduling pattern supports both.
- K8s probe behavior is the interesting complexity here, not traffic patterns.

### Metrics Collection: Time-Window Sampling

**Recommendation:** Sample metrics at 1-second simulation time intervals. [CITED: .planning/research/ARCHITECTURE.md MetricsCollector design]

**Rationale:**
- At 100 RPS and 100x speed, per-event recording would produce 10,000 data points per real second. Wasteful.
- 1-second windows give smooth charts with bounded memory: 5-minute simulation = 300 samples.
- MetricsCollector accumulates into a "current bucket" and flushes to samples array every simulated second.
- Bucket tracks: totalRequests, total503s, activeWorkers, readyPods, per-profile response time sums/counts.

### Dropped Request Counting: Include in 503 Metrics

**Recommendation:** Count requests dropped by pod restart as a separate category (`droppedByRestart`) alongside `rejected503`. Both contribute to the total failure count but are distinguishable in metrics. [ASSUMED -- engineering judgment]

**Rationale:**
- Users want to know total requests that failed. Dropped-by-restart is a failure from the client's perspective.
- Separating them lets the report distinguish "rejected because no capacity" vs "killed by restart."

## Probe Timing Model (Critical Detail)

### Actual K8s Behavior vs Our Model

**Actual K8s (kubelet):** Uses a fixed-interval ticker (`time.NewTicker`). Next probe fires on a clock, not relative to completion. If probe takes longer than period, next probe starts immediately after. [VERIFIED: kubernetes/kubernetes/blob/master/pkg/kubelet/prober/worker.go]

**Our model (D-08):** Next probe fires `periodSeconds` after previous completes/times out. This is a simplification that produces slightly different timing but is easier to reason about and test deterministically. This is a locked decision from the discuss phase.

**Impact:** Our model is slightly more forgiving (probes are spaced further apart when they take a long time). This is acceptable for a demonstration tool. The cascading failure pattern is the same; only exact timing differs by a few seconds.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed-step simulation (1ms increments) | Event-driven DES (jump to next event) | Always best practice for DES | 30M iterations -> ~35K events for 5min sim |
| Math.random() for determinism | Seedable PRNG (mulberry32) | Standard practice | Reproducible simulation results |
| Sorted array priority queue | Binary min-heap | Always best practice | O(log n) vs O(n) insert at high event rates |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Custom min-heap (~40 lines) is preferable to heap-js library | Standard Stack | Low -- heap-js would work fine, just adds a dependency |
| A2 | Uniform request arrival is better than Poisson for this tool | Discretionary Decisions | Low -- Poisson is a 1-line change if desired |
| A3 | Dropped-by-restart should be a separate metric category | Discretionary Decisions | Low -- can be merged with 503 count later |
| A4 | Vitest `environment: 'node'` is sufficient for pure TS engine tests | Standard Stack | Very low -- no DOM needed |

## Open Questions

1. **Event cancellation mechanism**
   - What we know: Pod restart needs to cancel pending PROBE_TIMEOUT events for that pod. PROBE_COMPLETE events for probes that timed out should be ignored.
   - What's unclear: Whether to use tombstone pattern (mark events, skip on pop) or explicit removal.
   - Recommendation: Use tombstone pattern -- add a `cancelled` flag or generation counter on pods. When processing an event, check if the pod's generation matches the event's generation. Cheaper than O(n) queue scan for removal.

2. **Request arrival scheduling granularity at low RPS**
   - What we know: At 1 RPS, interval is 1000ms. At 0.5 RPS, interval is 2000ms.
   - What's unclear: Whether fractional RPS should be supported.
   - Recommendation: Support any positive RPS. Use `Math.round(1000 / rps)` for interval. Floor to ensure at least 1ms interval.

3. **Snapshot creation cost at high speed**
   - What we know: At 100x speed, snapshot is created every RAF tick (~60 times/second). With 20 pods and 8 workers each, that's 160 worker objects per snapshot.
   - What's unclear: Whether creating fresh objects causes GC pressure.
   - Recommendation: Start with simple object creation. Profile if needed. At <20 pods, GC pressure is negligible. [CITED: .planning/research/ARCHITECTURE.md -- "Plain object created fresh... At 60fps with <20 pods, object creation cost is negligible"]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite, Vitest, npm | Yes | v23.11.0 | -- |
| npm | Package management | Yes | 11.12.1 | -- |
| TypeScript | Type checking | Install needed | ~5.7.3 (target) | -- |
| Vitest | Unit testing | Install needed | 4.1.4 (target) | -- |
| Vite | Build/dev tooling | Install needed | 8.0.8 (target) | -- |

**Missing dependencies with no fallback:** None -- all dependencies are installable via npm.

**Missing dependencies with fallback:** None.

**Note:** Node.js 23.11.0 supports native TypeScript stripping (22.18+/23.6+), which means Vitest can run TS tests without extra transform configuration. [CITED: Vitest docs -- "If you are using Node.js 22.18+ or 23.6+, TypeScript is stripped natively"]

## Sources

### Primary (HIGH confidence)
- SPEC.md -- Complete simulation model, pod state machine, event list, parameter definitions
- .planning/research/ARCHITECTURE.md -- DES engine architecture, component boundaries, data flow, build order
- .planning/research/PITFALLS.md -- 18 domain-specific pitfalls with prevention strategies
- .planning/research/STACK.md -- Technology stack versions and selection rationale
- .planning/REQUIREMENTS.md -- 21 requirements for Phase 1 (SIM/POD/HC/LB)
- npm registry -- TypeScript 5.7.3, Vitest 4.1.4 version verification

### Secondary (MEDIUM confidence)
- [Kubernetes probe documentation](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/) -- Probe timing behavior
- [kubelet prober/worker.go](https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/prober/worker.go) -- Actual ticker-based probe scheduling
- [mulberry32 PRNG](https://github.com/cprosche/mulberry32) -- Seedable PRNG implementation
- [Vitest getting started](https://vitest.dev/guide/) -- Vitest 4 configuration for node environment

### Tertiary (LOW confidence)
None -- all claims verified or cited.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- versions verified via npm, project decisions locked
- Architecture: HIGH -- DES is textbook CS, architecture docs are canonical project references
- Pitfalls: HIGH -- documented in project research with prevention strategies, K8s behavior verified against source code
- Probe timing model: HIGH -- actual K8s behavior verified, simplification in D-08 is an intentional locked decision

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable domain, 30-day validity)
