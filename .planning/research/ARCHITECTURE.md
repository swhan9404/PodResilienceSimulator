# Architecture Patterns

**Domain:** Browser-based discrete event simulation with real-time visualization
**Researched:** 2026-04-11
**Confidence:** HIGH (discrete event simulation and Canvas/React integration are mature, well-documented patterns)

## Recommended Architecture

### High-Level Overview

```
+-----------------------+       snapshot (readonly)       +--------------------+
|   Simulation Engine   | -----------------------------> |   React UI Layer   |
|   (pure TypeScript)   |                                |                    |
|                       |                                | ParameterPanel     |
| - EventQueue (heap)   |   user actions (start/stop/    | Controls           |
| - Pod state machines  |    config changes)              | ResultReport       |
| - LoadBalancer        | <------------------------------ |                    |
| - MetricsCollector    |                                +--------------------+
|                       |                                         |
+-----------+-----------+                                         |
            |                                                     |
            | snapshot ref                                        |
            v                                                     v
+--------------------+                                +--------------------+
| Canvas Renderer    |                                | Chart Renderer     |
| (imperative draw)  |                                | (uPlot 1.6.32)    |
| Pod grid, workers, |                                | Time-series charts |
| backlog, probes    |                                | for metrics        |
+--------------------+                                +--------------------+
```

**Key principle:** The simulation engine is completely framework-agnostic. It has zero React imports, zero DOM access, zero Canvas access. It is a pure state machine that advances simulation time and produces snapshots. This separation is the single most important architectural decision.

### Component Boundaries

| Component | Responsibility | Owns | Communicates With |
|-----------|---------------|------|-------------------|
| **SimulationEngine** | Advances simulation time, processes events, maintains world state | EventQueue, simulation clock, Pod array, LoadBalancer, MetricsCollector | Produces `SimulationSnapshot`; receives `SimulationConfig` and commands |
| **EventQueue** | Min-heap priority queue ordered by event time | Event array | Only accessed by SimulationEngine |
| **Pod** | State machine (READY/NOT_READY/RESTARTING), manages workers and backlog | Worker slots, backlog queue, probe state counters | Receives events from engine, returns state |
| **Worker** | Tracks single worker slot occupancy | Current request (or null), busy-until timestamp | Owned by Pod, no external communication |
| **LoadBalancer** | Distributes requests to ready pods via strategy pattern | Strategy instance, round-robin index | Reads pod ready-state, returns target pod |
| **MetricsCollector** | Aggregates time-series data from simulation events | Sampled metric arrays (worker usage, 503 count, response times, etc.) | Receives events from engine; snapshot read by chart renderer |
| **SimulationLoop** | The `requestAnimationFrame` bridge between engine and renderers | RAF handle, speed multiplier, wall-clock tracking | Calls engine.step(), triggers Canvas redraw and React snapshot update |
| **CanvasRenderer** | Draws pod grid, workers, backlog bars, probe indicators | Canvas 2D context, layout calculations | Reads `SimulationSnapshot`, writes to canvas element |
| **ChartRenderer** | Draws time-series metrics charts via uPlot | uPlot instances, data buffers | Reads `MetricsSnapshot` from MetricsCollector |
| **React Components** | Parameter inputs, controls, result report | Form state (Zustand 5.0.12), UI state | Sends config/commands to engine; reads snapshot for display values |
| **useSimulation hook** | Bridges React lifecycle with SimulationLoop | Engine ref, snapshot state, RAF lifecycle | Creates/destroys engine, exposes snapshot as React state |

### Data Flow

**Direction is strictly one-way for simulation data, with a narrow command channel back:**

```
1. User sets parameters in React UI (stored in Zustand)
   |
   v
2. useSimulation hook creates SimulationEngine with config
   |
   v
3. User clicks Start -> SimulationLoop begins
   |
   v
4. Each animation frame:
   a. SimulationLoop reads wall-clock delta, multiplies by speed
   b. Calls engine.step(simulationDeltaMs)
   c. Engine processes all events in queue up to new clock time
   d. Engine produces SimulationSnapshot (immutable object)
   e. SimulationLoop passes snapshot to CanvasRenderer.draw(snapshot)
   f. SimulationLoop throttled-updates React state with snapshot (max 10-20Hz for React)
   g. MetricsCollector samples are passed to ChartRenderer (uPlot)
   |
   v
5. React re-renders: Controls show elapsed time, 503 count, ready pods
   Canvas re-renders: Pod grid visualization (60fps)
   Charts re-render: uPlot time-series graphs (10-30fps is sufficient)
```

**Critical: React state updates are throttled.** The simulation may advance thousands of events per frame at 100x speed. Canvas draws every frame (60fps). But React re-renders are expensive and only needed for text displays (elapsed time, counters), so they are throttled to ~10-20Hz.

## Core Component Designs

### 1. SimulationEngine -- Discrete Event Simulation Core

**Pattern: Event-driven simulation with a min-heap priority queue.**

This is the textbook DES pattern, universally used in network simulators, queuing theory tools, and game engines.

```typescript
// Core types
interface SimEvent {
  time: number;        // simulation time in ms when this event fires
  type: EventType;
  payload: EventPayload;
}

type EventType =
  | 'REQUEST_ARRIVAL'
  | 'REQUEST_COMPLETE'
  | 'LIVENESS_PROBE'
  | 'READINESS_PROBE'
  | 'PROBE_TIMEOUT'
  | 'POD_RESTART'
  | 'POD_INIT_COMPLETE';

class SimulationEngine {
  private clock: number = 0;
  private eventQueue: MinHeap<SimEvent>;
  private pods: Pod[];
  private loadBalancer: LoadBalancer;
  private metrics: MetricsCollector;
  private config: SimulationConfig;
  private running: boolean = false;

  // Advance simulation by deltaMs of simulation time
  step(deltaMs: number): void {
    const targetTime = this.clock + deltaMs;

    // Process ALL events up to targetTime
    while (!this.eventQueue.isEmpty() && this.eventQueue.peek().time <= targetTime) {
      const event = this.eventQueue.pop();
      this.clock = event.time;
      this.processEvent(event);
    }

    this.clock = targetTime;
  }

  // Returns readonly snapshot of current state for rendering
  getSnapshot(): SimulationSnapshot { ... }
}
```

**Why a min-heap and not a sorted array or linked list:**
- Insert: O(log n) vs O(n) for sorted array
- Pop min: O(log n) vs O(1) for sorted array, but insert dominates
- Typical queue size: 100-500 events (pods * probes + active requests + arrivals). A heap is ideal at this scale.

**Step granularity:** The engine does NOT step in fixed time increments. It jumps from event to event. The `step(deltaMs)` method processes all events whose time falls within `[clock, clock + deltaMs]`. This is critical for correctness -- at 100x speed, a single frame might advance 1.6 seconds of simulation time, and hundreds of events could fire.

### 2. Pod State Machine

```typescript
enum PodState {
  READY = 'READY',
  NOT_READY = 'NOT_READY',
  RESTARTING = 'RESTARTING',
}

class Pod {
  id: number;
  state: PodState;
  workers: (ActiveRequest | null)[];   // fixed-size array, null = idle
  backlog: ActiveRequest[];            // FIFO queue, max length = maxBacklogPerPod
  livenessCounter: ProbeCounter;       // tracks consecutive success/failure
  readinessCounter: ProbeCounter;      // tracks consecutive success/failure

  // Try to accept a request (user request or probe)
  tryAccept(request: SimRequest, currentTime: number): AcceptResult {
    // 1. Find idle worker -> assign immediately
    // 2. No idle worker, backlog not full -> enqueue
    // 3. Backlog full -> reject (503 for requests, immediate failure for probes)
  }

  // Called when a worker finishes its request
  completeRequest(workerIndex: number, currentTime: number): ActiveRequest | null {
    // 1. Free the worker
    // 2. If backlog non-empty, dequeue and assign to freed worker
    // 3. Return dequeued request (so engine can schedule its completion)
  }
}
```

**State transitions are event-driven, not polled.** The engine schedules probe events at the correct times. When a probe fires, the Pod evaluates the result and updates counters. Threshold checks happen inside the event handler, not in a polling loop.

### 3. SimulationLoop -- The RAF Bridge

This is the component that connects wall-clock time to simulation time and orchestrates rendering.

```typescript
class SimulationLoop {
  private engine: SimulationEngine;
  private canvasRenderer: CanvasRenderer;
  private chartRenderer: ChartRenderer;
  private onSnapshotUpdate: (snapshot: SimulationSnapshot) => void;
  private speed: number = 1;
  private lastTimestamp: number = 0;
  private rafHandle: number = 0;
  private reactThrottleMs: number = 50; // ~20Hz for React updates
  private lastReactUpdate: number = 0;

  private tick = (timestamp: number) => {
    const wallDelta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Clamp wall delta to avoid spiral of death after tab switch
    const clampedDelta = Math.min(wallDelta, 100); // max 100ms wall time per frame

    const simDelta = clampedDelta * this.speed;
    this.engine.step(simDelta);

    const snapshot = this.engine.getSnapshot();

    // Canvas: every frame (60fps)
    this.canvasRenderer.draw(snapshot);

    // Charts: every frame or throttled (uPlot handles this efficiently)
    this.chartRenderer.update(snapshot.metrics);

    // React state: throttled
    if (timestamp - this.lastReactUpdate > this.reactThrottleMs) {
      this.onSnapshotUpdate(snapshot);
      this.lastReactUpdate = timestamp;
    }

    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
```

**The "spiral of death" clamp is critical.** If the user switches tabs and comes back, `wallDelta` could be several seconds. Without clamping, the engine would try to process millions of events in one frame, freezing the browser. Clamping to 100ms means at 100x speed, the simulation advances at most 10 seconds per frame -- still fast, but manageable.

### 4. CanvasRenderer -- Imperative Drawing

**Pattern: Stateless renderer that takes a snapshot and draws the entire frame.**

```typescript
class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private layout: LayoutCalculator;

  draw(snapshot: SimulationSnapshot): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.layout.calculate(snapshot.pods.length);

    for (const pod of snapshot.pods) {
      this.drawPod(pod);
    }

    this.drawSummaryBar(snapshot);
  }

  private drawPod(pod: PodSnapshot): void {
    // Border color by state
    // Worker bars with request color and progress
    // Backlog bar with fill ratio
    // Probe status indicators
  }
}
```

**Why full redraw, not dirty-region tracking:** For 5-20 pods with 4-8 workers each, a full Canvas clear + redraw at 60fps is trivially fast (<1ms on modern hardware). Dirty-region tracking adds complexity for zero performance benefit at this scale.

### 5. React Integration via useSimulation Hook

```typescript
function useSimulation() {
  const engineRef = useRef<SimulationEngine | null>(null);
  const loopRef = useRef<SimulationLoop | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle');

  const start = useCallback((config: SimulationConfig) => {
    const engine = new SimulationEngine(config);
    engineRef.current = engine;
    const loop = new SimulationLoop(engine, canvasRef, chartRef, (snap) => {
      setSnapshot(snap);  // throttled by SimulationLoop
    });
    loopRef.current = loop;
    loop.start();
    setPhase('running');
  }, []);

  const pause = useCallback(() => { loopRef.current?.pause(); setPhase('paused'); }, []);
  const resume = useCallback(() => { loopRef.current?.resume(); setPhase('running'); }, []);
  const stopRequests = useCallback(() => { engineRef.current?.stopRequests(); }, []);
  const setSpeed = useCallback((s: number) => { loopRef.current?.setSpeed(s); }, []);

  useEffect(() => () => { loopRef.current?.stop(); }, []);

  return { snapshot, phase, start, pause, resume, stopRequests, setSpeed };
}
```

**Key decisions:**
- **Engine lives in a ref, not in state.** The engine is a mutable object that changes thousands of times per second. Putting it in React state would cause catastrophic re-renders.
- **Snapshot is the only React state from the simulation.** Set at a throttled rate (10-20Hz). Drives UI text updates.
- **Canvas draws happen outside React.** The Canvas renderer is called imperatively from SimulationLoop.

### 6. MetricsCollector -- Time-Series Aggregation

```typescript
class MetricsCollector {
  private sampleIntervalMs: number = 1000; // 1 simulated second per sample
  private lastSampleTime: number = 0;
  private samples: MetricsSample[] = [];
  private currentBucket: MetricsBucket;

  record(event: MetricEvent): void {
    this.currentBucket.accumulate(event);
  }

  maybeSample(currentTime: number): void {
    if (currentTime - this.lastSampleTime >= this.sampleIntervalMs) {
      this.samples.push(this.currentBucket.flush());
      this.lastSampleTime = currentTime;
    }
  }

  getTimeSeries(): MetricsSample[] {
    return this.samples;
  }
}
```

**Why sample at 1-second intervals:** At 100 RPS with 100x speed, the engine processes 10,000 events/second of wall time. Charting every event is wasteful. Sampling at 1-second simulation intervals gives smooth charts with bounded memory: a 5-minute simulation = 300 samples.

## Patterns to Follow

### Pattern 1: Snapshot-Based Rendering

**What:** The engine produces an immutable snapshot object. All renderers consume the same snapshot. No renderer ever mutates engine state.

**When:** Always. This is the foundational pattern.

```typescript
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

interface PodSnapshot {
  id: number;
  state: PodState;
  workers: WorkerSnapshot[];
  backlogSize: number;
  backlogMax: number;
  livenessHistory: boolean[];
  readinessHistory: boolean[];
}
```

### Pattern 2: Command/Config Separation

**What:** User inputs flow as config objects or discrete commands. They never directly mutate engine internals.

```typescript
// Commands are simple method calls, not state mutations
engine.stopRequests();    // sets internal rps to 0
loop.setSpeed(50);        // changes multiplier
loop.pause();             // stops RAF loop
```

### Pattern 3: Event Self-Scheduling

**What:** Events schedule their own successors. A `REQUEST_ARRIVAL` schedules the next `REQUEST_ARRIVAL`. A `LIVENESS_PROBE` schedules the next `LIVENESS_PROBE` (after `periodSeconds`).

**Why:** Avoids polling, keeps the event queue as the single source of truth for "what happens next," and naturally handles variable rates (RPS going to 0 means no new `REQUEST_ARRIVAL` is scheduled).

```typescript
case 'REQUEST_ARRIVAL':
  this.handleRequestArrival(event);
  if (this.rps > 0) {
    const intervalMs = 1000 / this.rps;
    this.eventQueue.push({
      time: this.clock + intervalMs,
      type: 'REQUEST_ARRIVAL',
      payload: this.generateRequest(),
    });
  }
  break;
```

### Pattern 4: Probe as Regular Request

**What:** Probes are modeled as requests that compete for workers and backlog space, exactly like user requests. Only difference: 1ms processing time + timeout/threshold evaluation.

**Why:** This is the core insight of the simulation. The cascading failure happens because probes compete with slow requests for workers.

## Anti-Patterns to Avoid

### Anti-Pattern 1: React State for Simulation Data

**What:** Storing pod states, worker states, or event queue in React state or context.
**Why bad:** Thousands of state updates per second at 100x speed. Reconciliation kills performance.
**Instead:** Engine state in plain TS classes behind a ref. Only snapshot enters React state at throttled intervals.

### Anti-Pattern 2: Fixed Time-Step Simulation

**What:** Advancing simulation by a fixed 1ms increment and checking for events at each step.
**Why bad:** At 100x speed for 5 minutes: 30,000,000 iterations. Browser freezes.
**Instead:** Event-driven stepping. Jump from event to event. 5-minute simulation = ~35,000 events total.

### Anti-Pattern 3: Web Worker for Simulation

**What:** Moving the engine to a Web Worker.
**Why bad for this project:** Engine step takes <1ms. postMessage serialization overhead for every snapshot (60fps) outweighs the benefit. Canvas rendering must be on main thread anyway.
**When to reconsider:** Only if profiling shows engine.step() taking >5ms per frame.

### Anti-Pattern 4: DOM-Based Pod Visualization

**What:** Rendering each pod/worker as React components with DOM elements.
**Why bad:** 200+ DOM elements updating at 60fps. React reconciliation cost is significant.
**Instead:** Single Canvas element. One draw call per frame. Zero DOM reconciliation.

### Anti-Pattern 5: Charting Every Data Point

**What:** Pushing every event directly into chart data arrays.
**Why bad:** 30,000+ data points per metric. Chart libraries choke. Memory grows unbounded.
**Instead:** MetricsCollector samples at 1-second intervals. 300 data points for a 5-minute simulation.

## Component Dependency Graph (Build Order)

```
Layer 0 (no dependencies):
  types.ts          -- SimEvent, PodState, SimulationConfig, etc.
  priority-queue.ts -- MinHeap<T> data structure

Layer 1 (depends on Layer 0):
  worker.ts         -- Worker model (slot + busy-until)
  load-balancer.ts  -- LB strategy interface + RoundRobin
  metrics.ts        -- MetricsCollector + MetricsSample types

Layer 2 (depends on Layers 0-1):
  pod.ts            -- Pod state machine (uses Worker, types)
  events.ts         -- Event type definitions and payload types

Layer 3 (depends on Layers 0-2):
  engine.ts         -- SimulationEngine (uses everything above)

Layer 4 (depends on Layer 3):
  canvas-renderer.ts   -- CanvasRenderer (reads SimulationSnapshot)
  chart-renderer.ts    -- ChartRenderer via uPlot (reads MetricsSample[])
  simulation-loop.ts   -- SimulationLoop (orchestrates engine + renderers)

Layer 5 (depends on Layer 4):
  useSimulation.ts     -- React hook (wraps SimulationLoop)

Layer 6 (depends on Layer 5):
  React components     -- ParameterPanel, SimulationCanvas, MetricsChart, Controls, ResultReport
```

## Scalability Considerations

| Concern | 5 Pods (default) | 20 Pods | 50 Pods |
|---------|-------------------|---------|---------|
| Event queue size | ~50-100 events | ~200-400 events | ~500-1000 events |
| Engine step time per frame | <1ms | <2ms | <5ms |
| Canvas draw time per frame | <1ms | <2ms | <5ms (may need layout optimization) |
| Metrics memory (5 min sim) | ~300 samples, <100KB | Same | Same |
| React re-render cost | Negligible | Negligible | Negligible (snapshot is same structure) |

**At 50 pods, the architecture still works fine.** The bottleneck at extreme scale would be Canvas layout (fitting 50 pod rectangles on screen), not computation.

## Technology-Specific Notes

### Priority Queue Implementation

Use a binary min-heap. Do not use a library -- the implementation is ~40 lines of TypeScript and avoids a dependency for a critical data structure.

### Canvas Layout Strategy

Responsive grid layout calculator:
- Calculate available width/height from canvas dimensions
- Determine grid columns: `Math.ceil(Math.sqrt(podCount))`
- Each pod gets a fixed-size cell with padding
- DPI-aware: set canvas dimensions to `width * devicePixelRatio`, scale context accordingly

### Chart Library (uPlot 1.6.32)

uPlot is 545KB unpacked (verified via npm), Canvas-based, designed for time-series. Key integration points:
- Create uPlot instance with axes config and initial empty data
- On each metrics update, call `uPlot.setData()` with the full time-series arrays
- uPlot handles efficient Canvas redraw internally
- For streaming: append new samples to data arrays, call setData -- uPlot redraws only changed regions

### Snapshot Immutability

No structural sharing (Immutable.js) or deep freezing needed. Plain object created fresh by `getSnapshot()`. At 60fps with <20 pods, object creation cost is negligible. Deep cloning the pod array is fine -- it is small.

## Sources

- Discrete event simulation patterns: established computer science (HIGH confidence)
- Canvas rendering performance vs DOM/SVG: well-documented browser characteristics (HIGH confidence)
- React refs for mutable state: standard React pattern (HIGH confidence)
- requestAnimationFrame timing patterns: Web API standard (HIGH confidence)
- Min-heap priority queue: standard data structure (HIGH confidence)
- uPlot version and size: verified via npm registry on 2026-04-11 (HIGH confidence)
- Zustand 5 compatibility: peer deps verified via npm (HIGH confidence)
