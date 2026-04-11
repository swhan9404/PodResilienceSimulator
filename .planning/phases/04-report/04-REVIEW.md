---
phase: 04-report
reviewed: 2026-04-11T14:30:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/App.tsx
  - src/components/DegradationTimeline.tsx
  - src/components/PlaybackControls.tsx
  - src/components/ProfileTable.tsx
  - src/components/SimulationReport.tsx
  - src/components/SummaryCards.tsx
  - src/simulation/CriticalEventTracker.test.ts
  - src/simulation/CriticalEventTracker.ts
  - src/simulation/engine.test.ts
  - src/simulation/engine.ts
  - src/simulation/types.ts
  - src/store/useSimulationStore.ts
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-11T14:30:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the simulation engine core, critical event tracker, Zustand store, and new report UI components (DegradationTimeline, SummaryCards, ProfileTable, SimulationReport). The simulation engine is well-structured with a deterministic discrete-event model, proper tombstone pattern for stale event cancellation, and a safety valve against infinite loops. The report components are clean and presentational.

Five warnings were found: a potential stale-event bug in the engine's probe timeout handling, a race between allPodsDown detection and readiness state, missing request metadata cleanup on pod restart, a dequeued-item scheduling concern after worker removal, and an unused parameter in a component. Three info-level items flag minor code quality observations.

## Warnings

### WR-01: requestMeta map leaks entries on pod restart

**File:** `src/simulation/engine.ts:308-325`
**Issue:** When `handlePodRestart` is called, all workers and backlog items in the pod are cleared via `pod.restart()`. However, the `requestMeta` map (line 30) is never cleaned for the requests that were dropped. The comment on line 317 ("Clean up request metadata...") acknowledges this but the cleanup code is absent. Over a long simulation with many restarts, the map will accumulate orphaned entries that are never removed, causing unbounded growth in memory. More importantly, if request IDs ever wrap (unlikely with a monotonic counter but still a concern for correctness), stale metadata could produce wrong response time calculations.

**Fix:** After `pod.restart()`, iterate through the dropped requests and remove their entries from `requestMeta`. The `Pod.restart()` method already returns the dropped count but not the dropped request IDs. Either change `restart()` to return the dropped requests, or track pending request IDs per pod.

```typescript
// Option: track requestIds before restart, then clean up
private handlePodRestart(event: SimEvent): void {
  const pod = this.pods[event.podId!];
  this.criticalEvents.recordLivenessRestart(this.clock, pod.id);

  // Collect requestIds to clean up from workers and backlog
  const droppedIds: number[] = [];
  for (const w of pod.workers) {
    if (w !== null) droppedIds.push(w.requestId);
  }
  for (const b of pod.backlog) {
    droppedIds.push(b.requestId);
  }

  const droppedCount = pod.restart();

  // Clean up metadata
  for (const id of droppedIds) {
    this.requestMeta.delete(id);
  }

  if (droppedCount > 0) {
    this.metrics.record({ type: 'dropped_by_restart', count: droppedCount });
  }
  // ... rest unchanged
}
```

### WR-02: allPodsDown detected before readiness state is fully updated

**File:** `src/simulation/engine.ts:357-374`
**Issue:** In `handleProbeAction`, after `recordProbeResult` returns `remove_from_lb`, the code immediately checks `this.loadBalancer.getReadyCount() === 0` (line 369). However, `getReadyCount()` reads `pod.state` from each pod, and the state was already changed to `NOT_READY` inside `pod.recordProbeResult` (pod.ts line 113). So the check works for the current implementation. But note that `recordReadinessFailure` (line 368) is called *before* `recordAllPodsDown` (line 370) -- `recordReadinessFailure` records the first failure event. If the very first readiness failure also causes all pods to be down (single-pod scenario), then `firstReadinessFailure` and `allPodsDown` will both be set to the same timestamp, which is correct. However, the logic couples the all-pods-down check tightly to the readiness-failure handler. If a liveness restart causes a pod to go to RESTARTING (removing it from LB effectively), that scenario is NOT checked for all-pods-down. A pod that restarts is in `RESTARTING` state and `getReadyCount()` would exclude it, but `recordAllPodsDown` is only called in the readiness failure path.

**Fix:** Add an all-pods-down check after liveness restart triggers as well:

```typescript
private handleProbeAction(pod: Pod, probeResult: { action: string }): void {
  if (probeResult.action === 'restart') {
    this.eventQueue.push({
      time: this.clock,
      type: 'POD_RESTART',
      podId: pod.id,
      generation: pod.generation,
    });
  }
  if (probeResult.action === 'remove_from_lb' || probeResult.action === 'restart') {
    if (probeResult.action === 'remove_from_lb') {
      this.criticalEvents.recordReadinessFailure(this.clock, pod.id);
    }
    // Check after any state change that removes a pod from serving
    if (this.loadBalancer.getReadyCount() === 0) {
      this.criticalEvents.recordAllPodsDown(this.clock);
    }
  }
}
```

### WR-03: removeFromWorker dequeue may schedule events with stale endTime

**File:** `src/simulation/engine.ts:406-419`
**Issue:** In `removeFromWorker` (used by probe timeout handling), when a probe is removed from a worker slot, the next backlogged item is dequeued and placed in the worker. The `scheduleDequeuedItem` call uses `dequeued.endTime`, which was set at the original arrival time (`this.clock + profile.latencyMs`). Since the request has been waiting in the backlog, its `endTime` was computed from its original arrival. This means the request's processing time in the worker is measured from when it originally arrived, not from when it actually starts processing on the worker. For regular requests dequeued via `handleRequestComplete` -> `pod.completeRequest`, the same issue exists -- `endTime` is from arrival time, not from dequeue time.

Looking at the broader design, this appears to be intentional: the request's latency includes wait time in backlog (total response time = latencyMs from arrival). This is actually a modeling choice. However, if the intent is that `latencyMs` represents processing time (time on worker), then all dequeued items have incorrect endTimes. The `endTime` in `ActiveRequest` is computed as `arrivalTime + latencyMs`, making the effective worker processing time `endTime - dequeueTime`, which could be very short if the request waited long in backlog.

**Fix:** If this is a deliberate design choice (total response time model), document it clearly. If processing time should be independent of wait time, update endTime when dequeued:

```typescript
// In Pod.completeRequest and in removeFromWorker, after dequeuing:
next.startTime = currentTime;
next.endTime = currentTime + (next.endTime - next.startTime); // preserve original duration
```

### WR-04: Probe timeout may interfere with already-completed probes in edge case

**File:** `src/simulation/engine.ts:284-305`
**Issue:** In `handleProbeTimeout`, the method calls `isProbeStillPending` which checks if a probe with the given requestId is still in a worker or backlog. If the probe completed but the PROBE_COMPLETE event has not yet been processed (it is still in the event queue), `isProbeStillPending` returns false and the timeout is correctly treated as stale. However, there is a race scenario: if a probe is assigned to a worker and its PROBE_COMPLETE event is scheduled at `endTime`, but the PROBE_TIMEOUT fires at `startTime + timeoutSeconds*1000`, and the probe processing time is 1ms while the timeout is seconds away, the probe will always complete before the timeout fires. This is correctly handled. But consider a scenario where `timeoutSeconds` is very small (e.g., 0) or probe processing takes longer than expected due to the event queue ordering. In the current implementation, probes always take 1ms (line 225), so a 0-second timeout would fire at the same time as or before the PROBE_COMPLETE. If both fire at the same clock tick, processing order depends on insertion order into the min-heap, which is not deterministic for equal timestamps.

**Fix:** Add a tiebreaking mechanism or ensure PROBE_COMPLETE events are processed before PROBE_TIMEOUT events at the same timestamp. One approach is to add a sequence number to events for stable ordering:

```typescript
// In SimEvent type, add:
sequence?: number;

// In MinHeap comparator:
(a, b) => a.time - b.time || (a.sequence ?? 0) - (b.sequence ?? 0)

// PROBE_COMPLETE gets lower sequence than PROBE_TIMEOUT
```

Alternatively, document that `timeoutSeconds` must be >= 1 and validate it in config.

### WR-05: Unused parameter `simulationDurationMs` in DegradationTimeline

**File:** `src/components/DegradationTimeline.tsx:25`
**Issue:** The component declares `simulationDurationMs` in its props interface and destructures it in the function signature (line 25), but never uses it in the component body. The parent `SimulationReport.tsx` (line 24) passes it explicitly. This is dead code that may confuse future maintainers about whether the parameter is needed.

**Fix:** Remove from the destructured params if not used:

```typescript
export function DegradationTimeline({ criticalEvents, rps, profileCount }: DegradationTimelineProps) {
```

Or remove from the interface if truly unnecessary. If it is planned for future use, add a comment.

## Info

### IN-01: Commented acknowledgment of missing cleanup

**File:** `src/simulation/engine.ts:317`
**Issue:** Line 317 has a comment `// Clean up request metadata for any requests that were in this pod` followed by `// (workers and backlog were cleared by restart)` but no actual cleanup code follows. This reads as a TODO that was left incomplete.

**Fix:** Either implement the cleanup (see WR-01) or remove the misleading comment.

### IN-02: DegradationTimeline renders pod ID text even when event is null

**File:** `src/components/DegradationTimeline.tsx:36,46`
**Issue:** When `criticalEvents.firstReadinessFailure` is null, the event is filtered out by `visible: false` (line 42). However, the `detail` string on line 37 still interpolates `criticalEvents.firstReadinessFailurePodId` which would be `null`, producing `"Pod null removed from load balancer"`. This string is never rendered since `visible` is false, so it is not a user-facing bug, but it does unnecessary string interpolation with null values on every render.

**Fix:** Guard the detail string with a conditional or compute it lazily:

```typescript
detail: criticalEvents.firstReadinessFailure !== null
  ? `Pod ${criticalEvents.firstReadinessFailurePodId} removed from load balancer`
  : '',
```

### IN-03: Magic number 50000 for MAX_EVENTS_PER_STEP

**File:** `src/simulation/engine.ts:36`
**Issue:** The safety valve constant `MAX_EVENTS_PER_STEP = 50000` is defined as a private static readonly, which is good. However there is no documentation explaining how this number was chosen or what the expected upper bound of events per step is under normal operation.

**Fix:** Add a brief comment explaining the rationale:

```typescript
// Safety valve: caps events per step() call to prevent infinite loops in pathological configs.
// Normal operation at 100 RPS with 20 pods processes ~1500 events/second; 50K provides 30x headroom.
private static readonly MAX_EVENTS_PER_STEP = 50000;
```

---

_Reviewed: 2026-04-11T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
