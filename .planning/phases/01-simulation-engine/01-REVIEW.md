---
phase: 01-simulation-engine
reviewed: 2026-04-11T12:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - package.json
  - src/simulation/engine.test.ts
  - src/simulation/engine.ts
  - src/simulation/load-balancer.test.ts
  - src/simulation/load-balancer.ts
  - src/simulation/metrics.test.ts
  - src/simulation/metrics.ts
  - src/simulation/pod.test.ts
  - src/simulation/pod.ts
  - src/simulation/priority-queue.test.ts
  - src/simulation/priority-queue.ts
  - src/simulation/rng.test.ts
  - src/simulation/rng.ts
  - src/simulation/types.ts
  - tsconfig.json
  - vite.config.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-11T12:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The simulation engine implements a discrete-event simulation for modeling slow-request cascading failures in EKS pod environments. The architecture is well-structured: a MinHeap-based priority queue drives event scheduling, Pods manage worker slots and backlog with probe state machines, a round-robin load balancer routes requests, and a MetricsCollector samples at 1-second intervals.

Overall code quality is good -- types are well-defined, the tombstone pattern for event cancellation on pod restart is correctly implemented, and test coverage is thorough. However, there is one critical bug in the probe timeout handling that can cause worker slot corruption, several logic issues around backlog dequeue scheduling and memory growth, and a few code quality items.

## Critical Issues

### CR-01: Probe timeout removes worker but schedules dequeued item with wrong endTime

**File:** `src/simulation/engine.ts:394-407`
**Issue:** In `removeFromWorker`, when a probe is removed from a worker slot due to timeout and a backlog item is dequeued, `scheduleDequeuedItem` is called with the dequeued request's original `endTime`. However, the dequeued request's `endTime` was calculated at the time of its arrival (`arrivalTime + latencyMs`), not from when it actually starts being processed by the worker. This means the dequeued request's completion event will fire at the wrong time -- potentially in the past if the request has been waiting in the backlog for a long time. This causes the request to complete instantly (or the event fires immediately on next step), distorting simulation accuracy.

The same issue exists in `handleRequestComplete` at line 194 via `completeRequest` -> `scheduleDequeuedItem`. When a request is dequeued from the backlog, its `endTime` is the originally computed `startTime + latencyMs` from arrival, not `currentClock + latencyMs`.

**Fix:** When dequeuing from backlog to a worker, recalculate `endTime` based on the current simulation clock:
```typescript
private scheduleDequeuedItem(pod: Pod, dequeued: ActiveRequest | null): void {
  if (!dequeued) return;

  // Recalculate timing: request starts processing NOW
  const latency = dequeued.endTime - dequeued.startTime;
  dequeued.startTime = this.clock;
  dequeued.endTime = this.clock + latency;

  const workerIndex = pod.workers.findIndex(w => w !== null && w.requestId === dequeued.requestId);
  if (workerIndex >= 0) {
    this.eventQueue.push({
      time: dequeued.endTime,
      type: dequeued.isProbe ? 'PROBE_COMPLETE' : 'REQUEST_COMPLETE',
      podId: pod.id,
      requestId: dequeued.requestId,
      workerIndex,
      probeType: dequeued.probeType,
      generation: pod.generation,
    });
  }
}
```

## Warnings

### WR-01: requestMeta map grows unboundedly for backlog/restart-dropped requests

**File:** `src/simulation/engine.ts:161`
**Issue:** In `handleRequestArrival`, when a request is queued in the backlog (`result.status === 'queued'`), its metadata is added to `this.requestMeta` at line 161. However, if the pod restarts (dropping the backlog), the corresponding `REQUEST_COMPLETE` event never fires, and the metadata is never cleaned up. Over a long simulation with many restarts, this map grows without bound, causing gradual memory growth.

**Fix:** Clean up `requestMeta` entries for dropped requests in `handlePodRestart`:
```typescript
private handlePodRestart(event: SimEvent): void {
  const pod = this.pods[event.podId!];
  // Collect requestIds from workers and backlog before restart
  const droppedIds: number[] = [];
  for (const w of pod.workers) {
    if (w !== null) droppedIds.push(w.requestId);
  }
  for (const b of pod.backlog) {
    droppedIds.push(b.requestId);
  }
  const droppedCount = pod.restart();
  // Clean up request metadata
  for (const id of droppedIds) {
    this.requestMeta.delete(id);
  }
  // ... rest of handler
}
```

### WR-02: stopRequests only sets rps to 0 but does not cancel already-queued REQUEST_ARRIVAL event

**File:** `src/simulation/engine.ts:438-443`
**Issue:** `stopRequests()` sets `this.rps = 0`, which prevents `handleRequestArrival` from scheduling the *next* arrival (line 183-189). However, there is already one `REQUEST_ARRIVAL` event sitting in the event queue that was scheduled before `stopRequests` was called. This means exactly one more request will arrive after stop. The test at line 266 acknowledges this with `expect(afterStop - beforeStop).toBeLessThanOrEqual(1)`, but this is a design smell -- the behavior is "stop requests, but one more leaks through." In a simulation showing exact recovery timing, this off-by-one request could be confusing.

**Fix:** Either document this as intentional behavior, or add a flag that `handleRequestArrival` checks:
```typescript
private requestsStopped: boolean = false;

stopRequests(): void {
  this.rps = 0;
  this.requestsStopped = true;
  if (this.phase === 'running') {
    this.phase = 'stopped_requests';
  }
}

private handleRequestArrival(): void {
  if (this.requestsStopped) return; // Discard the stale event
  // ... rest of handler
}
```

### WR-03: totalWorkerCount in snapshot does not account for restarting pods

**File:** `src/simulation/engine.ts:455`
**Issue:** `totalWorkerCount` is computed as `this.config.podCount * this.config.workersPerPod`, which is the *configured* total, not the *available* total. When a pod is in `RESTARTING` state, its workers are cleared and not accepting work. The `totalWorkerCount` field still reports them as part of the total. While this might be intentional (showing capacity vs. utilized), the `activeWorkerCount / totalWorkerCount` ratio becomes misleading during cascading failures since `totalWorkerCount` includes workers that cannot possibly be active.

**Fix:** Either rename to `configuredWorkerCount` to make the semantics clear, or compute it dynamically:
```typescript
totalWorkerCount: this.pods.filter(p => p.state !== PodState.RESTARTING).length * this.config.workersPerPod,
```

### WR-04: Metrics multi-second jump attributes all events to first bucket only

**File:** `src/simulation/metrics.ts:67-82`
**Issue:** When `maybeSample` is called with a large time jump (e.g., `maybeSample(3500, ...)`), the `while` loop flushes the first bucket with all accumulated events, then creates subsequent buckets with zeroes. This is technically tested and documented (metrics.test.ts line 43-54). However, in the engine's `step()` method, `maybeSample` is called only once at the end of a step (engine.ts:100), after all events in that step have been processed. If events are recorded via `this.metrics.record()` during mid-step processing (e.g., at clock=500 and clock=1500 within a single step to clock=2000), all those records land in the same bucket and get attributed to the first 1-second sample. The per-second granularity promise is not met for events within a single step.

**Fix:** Call `maybeSample` inside the event processing loop periodically, or pass the event timestamp to `record()` so the collector can bucket events correctly. For now, this is acceptable if steps are kept small (1 second), which the test scenarios do. Add a comment documenting this limitation.

### WR-05: Non-null assertions on optional SimEvent fields

**File:** `src/simulation/engine.ts:193-194, 210-211, 265-267, 280-281, etc.`
**Issue:** Throughout the engine, `event.podId!`, `event.workerIndex!`, `event.requestId!`, and `event.probeType!` are used with non-null assertions (`!`). While the event routing in `processEvent` ensures these fields are present for the relevant event types, the TypeScript type system does not enforce this -- `SimEvent` has all these fields as optional. If a new event type is added or routing logic changes, these assertions will silently pass the compiler but crash at runtime.

**Fix:** Use discriminated union types for `SimEvent` so that each event type carries exactly the fields it needs:
```typescript
export type SimEvent =
  | { time: number; type: 'REQUEST_ARRIVAL' }
  | { time: number; type: 'REQUEST_COMPLETE'; podId: number; requestId: number; workerIndex: number; generation: number }
  | { time: number; type: 'LIVENESS_PROBE'; podId: number; probeType: 'liveness'; generation: number }
  // ... etc
```
This eliminates all `!` assertions and makes the type system catch routing errors at compile time.

## Info

### IN-01: Unused variables in test file

**File:** `src/simulation/engine.test.ts:89-90`
**Issue:** Variables `engine1` and `engine2` are created at lines 89-90 but never used. The test creates `e1` and `e2` at lines 99-100 with the actual mixed config and uses those instead.

**Fix:** Remove the unused declarations:
```typescript
// Remove these two lines:
const engine1 = new SimulationEngine(makeConfig({ seed: 42 }));
const engine2 = new SimulationEngine(makeConfig({ seed: 99 }));
```

### IN-02: Pod internals (workers, backlog) are public and directly mutated by engine

**File:** `src/simulation/pod.ts:18-19` and `src/simulation/engine.ts:378-406`
**Issue:** `Pod.workers` and `Pod.backlog` are public arrays that the engine directly reads and mutates (e.g., `pod.backlog.findIndex`, `pod.backlog.splice`, `pod.workers[i] = null`). This breaks encapsulation -- the Pod class should own all mutations to its internal state. If a bug is introduced in the engine's direct manipulation (e.g., `removeFromWorker` at line 394), the Pod has no way to maintain invariants.

**Fix:** Add methods to Pod for these operations:
```typescript
class Pod {
  removeFromBacklog(requestId: number): boolean { ... }
  removeFromWorker(requestId: number): ActiveRequest | null { ... }
  isRequestPending(requestId: number): boolean { ... }
}
```

### IN-03: Magic number 1ms for probe processing time

**File:** `src/simulation/engine.ts:220`
**Issue:** The probe processing time is hardcoded as `this.clock + 1` (1ms). This is referenced in a comment as "per D-07" but the value itself is a magic number embedded in the engine logic.

**Fix:** Extract to a named constant:
```typescript
private static readonly PROBE_PROCESSING_MS = 1;
```

---

_Reviewed: 2026-04-11T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
