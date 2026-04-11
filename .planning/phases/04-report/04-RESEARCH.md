# Phase 4: Report - Research

**Researched:** 2026-04-11
**Domain:** React UI component (report panel), simulation engine event tracking, Tailwind CSS layout
**Confidence:** HIGH

## Summary

Phase 4 adds a post-simulation report that appears when the engine reaches the 'recovered' phase. The work has two distinct layers: (1) **engine-side**: adding critical event timestamp tracking to the SimulationEngine so RPT-01 through RPT-03 data exists, and (2) **UI-side**: building a React component that replaces the visualization area (PodCanvas + MetricsCharts) with a vertical timeline, summary stat cards, and a per-profile response time table.

The engine currently transitions to `phase='recovered'` when all pods return to READY after `stopRequests()`, but it does NOT record the timestamps of first readiness failure, first liveness restart, or total service down. These must be added. The Zustand store's `PlaybackState` also lacks a 'recovered' value -- the loop callback must detect `snapshot.phase === 'recovered'` and propagate it.

**Primary recommendation:** Add a `CriticalEventTracker` (plain TS class) to the engine that records event timestamps as they happen during simulation. Expose the data via `getSnapshot()` or a separate `getCriticalEvents()` method. Build the report as a single `SimulationReport` React component using Tailwind CSS, conditionally rendered in App.tsx when phase is 'recovered'.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** recovered 자동 표시 -- Stop Requests 후 모든 Pod가 Ready로 복구(phase='recovered')되면 자동으로 리포트 표시. 별도 버튼 없음
- **D-02:** 복구 시에만 표시 -- Stop Requests를 하지 않으면 리포트도 없음. RPT-04(복구시간)가 핵심이므로 복구 플로우를 강제
- **D-03:** Reset 시 리포트 사라짐 -- Reset 버튼 누르면 idle 상태로 돌아가며 리포트 제거
- **D-04:** 시각화 영역 대체 -- recovered 시 Pod Canvas + Charts 영역을 리포트로 교체. 좌측 패널은 그대로 유지(Reset 버튼 접근 가능)
- **D-05:** 좌측 패널 상태 유지 -- 컨트롤 패널(Reset 버튼 포함)은 리포트 표시 중에도 접근 가능
- **D-06:** 세로 타임라인으로 degradation 표현 (RPT-01~03) -- 시간축을 세로로 배치, 각 이벤트를 마커로 표시. 시뮬레이션 시작 -> 첫 readiness 실패 -> 첫 liveness restart -> 전체 서비스 다운 -> Stop Requests -> 복구 순서
- **D-07:** 카드 그리드로 summary stats 표현 (RPT-04~06) -- 복구시간, 503 비율, 총 처리 수를 큰 숫자 카드로. Profile별 응답시간은 별도 테이블
- **D-08:** 타임라인 먼저, 카드 아래 -- 위: degradation 타임라인 (스토리텔링), 아래: summary 카드 + profile 테이블
- **D-09:** 엔진에 critical event timestamp 추적 추가 필요 -- 현재 MetricsCollector와 SimulationSnapshot에는 첫 readiness 실패, 첫 liveness restart, 전체 서비스 다운 시점이 없음. 엔진 또는 별도 이벤트 로거에서 이 시점들을 기록해야 함

### Claude's Discretion
- 타임라인의 시각적 디테일 (마커 스타일, 색상, 간격 비례 여부)
- 카드 그리드 열 수 및 크기
- Critical event timestamp 수집 방식 (엔진 내부 vs 별도 collector)
- Profile 테이블 정렬 및 스타일링

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RPT-01 | 시뮬레이션 종료 후 첫 Readiness 실패 시점을 표시한다 | CriticalEventTracker records `firstReadinessFailure` timestamp when Pod transitions READY -> NOT_READY. Timeline component displays it. |
| RPT-02 | 첫 Liveness 실패(restart) 시점을 표시한다 | CriticalEventTracker records `firstLivenessRestart` timestamp when engine fires POD_RESTART. Timeline component displays it. |
| RPT-03 | 전체 서비스 다운 시점(모든 Pod Not Ready -> 503 시작)을 표시한다 | CriticalEventTracker records `allPodsDown` timestamp when `readyPodCount === 0`. Timeline component displays it. |
| RPT-04 | 복구 시간(요청 중단 ~ 전체 Pod Ready 복원)을 표시한다 | Engine already records `stopRequests` time (clock at phase transition) and `recovered` time. Delta = recovery time. Summary card displays it. |
| RPT-05 | Request profile별 평균 응답시간을 표시한다 | MetricsCollector already tracks `perProfileResponseTime` with cumulative sum/count per profile. Report computes `sum/count` per profile and displays in table. |
| RPT-06 | 총 처리/503 요청 수와 503 비율을 표시한다 | MetricsCollector already tracks `totalRequests`, `total503s`. Report computes ratio and displays in summary cards. |
</phase_requirements>

## Standard Stack

### Core (no new libraries needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.2.5 | UI components | Already installed, report is a React component [VERIFIED: package.json] |
| Tailwind CSS 4 | 4.2.2 | Styling for timeline, cards, table | Already installed, consistent with all existing UI [VERIFIED: package.json] |
| Zustand 5 | 5.0.12 | State management for report trigger | Already installed, store pattern established [VERIFIED: package.json] |

### No New Dependencies

This phase requires **zero new npm packages**. The report is a DOM-based component using Tailwind CSS. The vertical timeline, stat cards, and profile table are all simple HTML/CSS structures. No charting library needed for the report (it's static data, not real-time streaming).

**Installation:** None required.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── simulation/
│   ├── engine.ts          # ADD: CriticalEventTracker integration
│   ├── types.ts           # ADD: CriticalEvents interface, update SimulationSnapshot
│   └── CriticalEventTracker.ts  # NEW: tracks event timestamps
├── components/
│   ├── SimulationReport.tsx     # NEW: main report component
│   ├── DegradationTimeline.tsx  # NEW: vertical timeline (RPT-01~03)
│   ├── SummaryCards.tsx         # NEW: stat cards (RPT-04~06)
│   └── ProfileTable.tsx         # NEW: per-profile response time table (RPT-05)
├── store/
│   └── useSimulationStore.ts   # MODIFY: add 'recovered' playback state, report data
└── App.tsx                      # MODIFY: conditional rendering for report vs visualization
```

### Pattern 1: CriticalEventTracker (Engine-Side Data Collection)

**What:** A plain TypeScript class that records "first occurrence" timestamps for critical events during simulation. Instantiated by SimulationEngine, called from existing event handlers.

**When to use:** During simulation execution. The tracker is write-once per event type -- once `firstReadinessFailure` is set, subsequent readiness failures don't overwrite it.

**Implementation approach:**
```typescript
// src/simulation/CriticalEventTracker.ts
export interface CriticalEvents {
  firstReadinessFailure: number | null;   // sim clock ms
  firstReadinessFailurePodId: number | null;
  firstLivenessRestart: number | null;    // sim clock ms
  firstLivenessRestartPodId: number | null;
  allPodsDown: number | null;             // sim clock ms (readyCount === 0)
  stopRequestsTime: number | null;        // sim clock ms
  recoveredTime: number | null;           // sim clock ms
}
```
[VERIFIED: engine.ts lines 102-104 already detect recovered transition; lines 440-441 detect stopRequests]

The tracker hooks into:
- `handleProbeAction` -- when probeResult.action is 'remove_from_lb' (first readiness failure)
- `handlePodRestart` -- when POD_RESTART fires (first liveness restart)
- `step()` after readyCount calculation -- when readyCount === 0 (all pods down)
- `stopRequests()` -- record clock time
- `step()` phase transition to 'recovered' -- record clock time

### Pattern 2: Report Data Snapshot

**What:** The report consumes a frozen data object computed at the moment `phase === 'recovered'`. This avoids the report reading from a still-ticking engine.

**When to use:** The SimulationLoop callback or store action detects `snapshot.phase === 'recovered'`, computes report data once, and stores it in Zustand.

**Key data structure:**
```typescript
interface ReportData {
  criticalEvents: CriticalEvents;
  recoveryTimeMs: number;               // stopRequestsTime -> recoveredTime delta
  totalRequests: number;
  total503s: number;
  droppedByRestart: number;
  rate503Percent: number;               // (total503s / totalRequests) * 100
  perProfileAvgResponseTime: Array<{
    profileName: string;
    avgResponseTimeMs: number;
    requestCount: number;
  }>;
  simulationDurationMs: number;         // total clock time
}
```

### Pattern 3: Conditional Rendering in App.tsx

**What:** App.tsx switches between visualization (PodCanvas + MetricsCharts) and report (SimulationReport) based on playback state.

**When to use:** When `playback === 'recovered'`, render report; otherwise, render visualization.

**Current App.tsx structure** [VERIFIED: src/App.tsx]:
```tsx
// Current: always renders PodCanvas + MetricsCharts
<div className="flex-1 p-8 flex flex-col gap-6 overflow-auto">
  <section>... PodCanvas ...</section>
  <section>... MetricsCharts ...</section>
</div>

// Target: conditional
{playback === 'recovered'
  ? <SimulationReport data={reportData} />
  : <>
      <section>... PodCanvas ...</section>
      <section>... MetricsCharts ...</section>
    </>
}
```

### Pattern 4: Zustand PlaybackState Extension

**What:** Add 'recovered' to the PlaybackState union type and propagate the state transition.

**Current state** [VERIFIED: src/store/useSimulationStore.ts line 11]:
```typescript
type PlaybackState = 'idle' | 'running' | 'paused' | 'stopped_requests';
// Missing: 'recovered'
```

The `onChartUpdate` callback in `start()` already reads `engine.getSnapshot()` -- extend it to detect `snapshot.phase === 'recovered'` and:
1. Set `playback: 'recovered'`
2. Compute and store `reportData` from the final snapshot
3. Stop the simulation loop (no more ticking needed)

### Anti-Patterns to Avoid
- **Reading engine state from report component:** The report should consume a frozen `ReportData` object stored in Zustand, NOT call `engineRef.getSnapshot()` directly. The engine should be stopped after recovery.
- **Re-rendering report on every tick:** The report is static. Compute data once at recovery, store in Zustand, render from store. Do not subscribe to `chartData` or `statusClock` from the report component.
- **Hand-rolling timeline with Canvas:** The degradation timeline is a simple vertical list with markers. Use DOM + Tailwind, not Canvas. Canvas is for real-time visualization only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vertical timeline layout | Custom CSS positioning from scratch | Tailwind `relative`/`absolute` with a vertical line (`border-l-2`) and positioned markers | Stable CSS pattern, well-understood, no JS needed |
| Number formatting | Custom formatter | `Intl.NumberFormat` or simple `toFixed()` | Browser native, handles edge cases |
| Time formatting | Complex duration formatter | Reuse existing `formatElapsed` from StatusDisplay.tsx | Already implemented and tested [VERIFIED: src/components/StatusDisplay.tsx lines 3-11] |

**Key insight:** The entire report is static HTML/CSS. No animation, no real-time updates, no Canvas, no charting library. Tailwind utility classes are sufficient for all visual elements.

## Common Pitfalls

### Pitfall 1: Missing 'recovered' Playback State
**What goes wrong:** The Zustand store's `PlaybackState` currently lacks 'recovered'. Without adding it, the UI has no way to conditionally show the report. The `onChartUpdate` callback detects snapshot.phase === 'recovered' in the engine but doesn't transition the store.
**Why it happens:** Phase 3 implemented playback states but didn't anticipate Phase 4's report trigger.
**How to avoid:** Add 'recovered' to PlaybackState type union. In the onChartUpdate callback, check `snapshot.phase === 'recovered'` and transition playback state + stop loop + compute report data.
**Warning signs:** Report never appears despite engine reaching recovered phase.

### Pitfall 2: Engine Keeps Ticking After Recovery
**What goes wrong:** If the SimulationLoop continues running after recovery, it wastes CPU and may cause state confusion.
**Why it happens:** The loop's rAF callback has no termination condition based on engine phase.
**How to avoid:** When recovery is detected in the store callback, call `loop.stop()` to halt the rAF loop. The engine is effectively done.
**Warning signs:** DevTools shows continuous rAF callbacks after report is displayed.

### Pitfall 3: CriticalEventTracker Records Wrong Timestamps
**What goes wrong:** If tracking is hooked into the wrong event handler or checked at the wrong point in the step cycle, timestamps may be off by one step or miss the event entirely.
**Why it happens:** The engine processes events in a while-loop within `step()`. Readiness failure happens inside `handleProbeAction` which is called from `handleProbeComplete` or `handleProbeTimeout` -> `handleProbeFailure`. The Pod.recordProbeResult changes pod.state, but the readyCount check happens separately.
**How to avoid:** Track first readiness failure in `handleProbeAction` when `probeResult.action === 'remove_from_lb'`. Track first liveness restart in `handlePodRestart`. Track all-pods-down in the step() method after event processing, when `readyCount === 0`.
**Warning signs:** Timeline shows events in wrong order or with suspiciously identical timestamps.

### Pitfall 4: Report Data Computed Multiple Times
**What goes wrong:** The onChartUpdate callback fires at 1Hz (throttled). If recovery happens between callbacks, the first detection creates report data. But if the callback fires again before the loop is stopped, it may recompute.
**Why it happens:** Race between detecting 'recovered' and stopping the loop.
**How to avoid:** Guard with a flag: only compute report data if `playback !== 'recovered'` (i.e., first transition only). Stop the loop immediately after setting the state.
**Warning signs:** Console shows multiple report data computations.

### Pitfall 5: Per-Profile Response Time Uses Bucket Data Instead of Cumulative
**What goes wrong:** MetricsSample.perProfileResponseTime tracks per-second buckets. If you sum the last bucket, you get response times for just the last second, not the entire simulation.
**Why it happens:** MetricsCollector resets `currentBucket` each second.
**How to avoid:** For cumulative per-profile response time, iterate over ALL samples and sum up `perProfileResponseTime` across all buckets. Or add a cumulative accessor to MetricsCollector.
**Warning signs:** Average response times in the report are wildly different from what charts showed.

### Pitfall 6: All-Pods-Down Never Detected if Pods Cycle Fast
**What goes wrong:** If pods go NOT_READY briefly but recover before the next step boundary, the tracker may miss the moment when readyCount === 0.
**Why it happens:** The `allPodsDown` check runs once per `step()` call, after all events are processed. Pod state changes happen during event processing. If a pod goes NOT_READY and another goes READY within the same step, readyCount at step-end might be > 0.
**How to avoid:** Check `readyCount === 0` after each event that changes pod readiness (i.e., in `handleProbeAction` when action is 'remove_from_lb'), not just at step boundaries.
**Warning signs:** Report shows `null` for all-pods-down even though 503s clearly indicate total failure.

## Code Examples

### Critical Event Tracking Integration Points

The engine already has the exact hooks needed. Here are the integration points with line references:

**First readiness failure** -- `engine.ts` `handleProbeAction()` (line 351):
```typescript
// When probeResult.action === 'remove_from_lb', pod just went NOT_READY
// Record: this.criticalEvents.recordReadinessFailure(this.clock, pod.id);
```
[VERIFIED: src/simulation/engine.ts line 351-362]

**First liveness restart** -- `engine.ts` `handlePodRestart()` (line 302):
```typescript
// POD_RESTART event fired = liveness failure threshold exceeded
// Record: this.criticalEvents.recordLivenessRestart(this.clock, pod.id);
```
[VERIFIED: src/simulation/engine.ts line 302-319]

**All pods down** -- `engine.ts` `handleProbeAction()` after remove_from_lb:
```typescript
// After a pod is removed from LB, check if all pods are now NOT_READY
// const readyCount = this.loadBalancer.getReadyCount();
// if (readyCount === 0) this.criticalEvents.recordAllPodsDown(this.clock);
```
[VERIFIED: src/simulation/engine.ts -- loadBalancer.getReadyCount() available at line 99]

**Stop requests time** -- `engine.ts` `stopRequests()` (line 438):
```typescript
// Record: this.criticalEvents.recordStopRequests(this.clock);
```
[VERIFIED: src/simulation/engine.ts line 438-443]

**Recovery time** -- `engine.ts` `step()` (line 102-104):
```typescript
// When phase transitions to 'recovered'
// Record: this.criticalEvents.recordRecovered(this.clock);
```
[VERIFIED: src/simulation/engine.ts line 102-104]

### Cumulative Per-Profile Response Time Aggregation

```typescript
// Aggregate across all MetricsSamples for total averages
function aggregateProfileResponseTimes(
  samples: MetricsSample[]
): Array<{ profileName: string; avgResponseTimeMs: number; requestCount: number }> {
  const totals: Record<string, { sum: number; count: number }> = {};
  for (const sample of samples) {
    for (const [name, data] of Object.entries(sample.perProfileResponseTime)) {
      if (!totals[name]) totals[name] = { sum: 0, count: 0 };
      totals[name].sum += data.sum;
      totals[name].count += data.count;
    }
  }
  return Object.entries(totals).map(([name, { sum, count }]) => ({
    profileName: name,
    avgResponseTimeMs: count > 0 ? Math.round(sum / count) : 0,
    requestCount: count,
  }));
}
```
[VERIFIED: MetricsSample.perProfileResponseTime structure at src/simulation/types.ts line 108]

### Vertical Timeline CSS Pattern (Tailwind)

```tsx
// Vertical timeline with Tailwind -- established pattern, no library needed
<div className="relative pl-8">
  {/* Vertical line */}
  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-[var(--border-color)]" />

  {/* Event markers */}
  {events.map((event) => (
    <div key={event.label} className="relative mb-6 last:mb-0">
      {/* Dot */}
      <div className={`absolute -left-5 top-1 w-3 h-3 rounded-full ${event.colorClass}`} />
      {/* Content */}
      <div className="text-sm">
        <span className="font-semibold text-[var(--text-primary)]">{event.label}</span>
        <span className="text-[var(--text-secondary)] ml-2">{formatTime(event.timeMs)}</span>
      </div>
    </div>
  ))}
</div>
```
[ASSUMED -- standard Tailwind vertical timeline pattern]

### Stat Card Pattern (Tailwind)

```tsx
// Summary stat card consistent with project's dark mode variables
<div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)] text-center">
  <div className="text-xs font-semibold text-[var(--text-secondary)]">{label}</div>
  <div className="text-3xl font-bold text-[var(--text-primary)] mt-1">{value}</div>
  {subtitle && <div className="text-xs text-[var(--text-secondary)] mt-1">{subtitle}</div>}
</div>
```
[VERIFIED: Matches existing StatusDisplay.tsx StatusItem pattern at src/components/StatusDisplay.tsx]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Class components for conditional rendering | Ternary/logical AND in JSX | React 16+ | Simple conditional rendering pattern |
| CSS-in-JS for scoped styles | Tailwind utility classes | Project convention | No new libraries, consistent styling |

**Deprecated/outdated:**
- Nothing in this phase involves deprecated APIs. All patterns are current.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vertical timeline pattern using `border-l-2` + absolute positioning is the optimal Tailwind approach | Code Examples | Low -- if styling doesn't look right, trivial to adjust CSS classes. No functional impact. |
| A2 | SimulationLoop.tick can reliably detect `snapshot.phase === 'recovered'` within the onChartUpdate callback (1Hz throttle) | Architecture Patterns | Low -- worst case recovery detection is delayed up to 1 second of sim time. Acceptable since recovery is a one-time event. |
| A3 | Stopping the loop immediately after recovery detection won't cause issues with pending rAF | Common Pitfalls | Low -- `cancelAnimationFrame` is safe to call anytime. The existing `stop()` method handles this. |

**If this table is empty:** N/A -- three assumptions noted above, all low risk.

## Open Questions

1. **Should CriticalEventTracker be a separate class or inline in SimulationEngine?**
   - What we know: CONTEXT.md D-09 says "엔진 내부 vs 별도 collector" is Claude's discretion
   - What's unclear: Whether adding a separate class file is worth it for ~30 lines of tracking logic
   - Recommendation: Separate class. It keeps the engine clean (engine.ts is already 470 lines), makes the tracking logic independently testable, and follows the project's pattern of separating concerns (MetricsCollector is also separate).

2. **Where to compute cumulative per-profile response time?**
   - What we know: MetricsCollector stores per-second buckets in MetricsSample[]. Cumulative sums require iterating all samples.
   - What's unclear: Whether to add a cumulative accessor to MetricsCollector or compute in the report data generation.
   - Recommendation: Compute in report data generation (at recovery time). Adding it to MetricsCollector would create API surface used only once. Keep MetricsCollector focused on real-time sampling.

3. **Should the SimulationLoop detect recovery, or should the Zustand store callback detect it?**
   - What we know: Current architecture has the store's `onChartUpdate` callback already reading `engine.getSnapshot()`.
   - What's unclear: Whether to add recovery detection logic in SimulationLoop (which already manages the tick) or keep it in the store callback.
   - Recommendation: Detect in the store callback (inside `onChartUpdate` in `start()`). This keeps the store as the single source of truth for UI state transitions, consistent with the existing pattern where `stopRequests()` sets `playback: 'stopped_requests'` in the store.

## Sources

### Primary (HIGH confidence)
- `src/simulation/engine.ts` -- engine phase transitions, event handlers, snapshot API
- `src/simulation/types.ts` -- SimulationSnapshot, MetricsSample, PodSnapshot type definitions
- `src/simulation/metrics.ts` -- MetricsCollector bucket-based sampling, cumulative tracking
- `src/simulation/pod.ts` -- Pod state transitions, recordProbeResult actions
- `src/store/useSimulationStore.ts` -- Zustand store structure, PlaybackState, start/reset actions
- `src/App.tsx` -- current layout structure (left panel + right visualization)
- `src/components/ControlPanel.tsx` -- left panel component structure
- `src/components/PlaybackControls.tsx` -- state-conditional button rendering pattern
- `src/components/StatusDisplay.tsx` -- stat display pattern (label + value), formatElapsed utility
- `src/visualization/colors.ts` -- color constants and theme utilities
- `src/index.css` -- CSS custom properties for dark mode
- `package.json` -- installed dependencies, no new packages needed

### Secondary (MEDIUM confidence)
- `.planning/phases/04-report/04-CONTEXT.md` -- user decisions D-01 through D-09
- `.planning/phases/02-visualization/02-CONTEXT.md` -- layout decisions D-12 through D-14
- `.planning/phases/03-controls-parameters/03-CONTEXT.md` -- control panel decisions D-07, D-08

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing dependencies verified in package.json
- Architecture: HIGH -- clear integration points identified in engine.ts and store, patterns follow established codebase conventions
- Pitfalls: HIGH -- identified from direct code reading, specific line references provided for all integration points

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no external dependency changes, pure codebase-internal work)
