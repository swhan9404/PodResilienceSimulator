import {
  type SimEvent,
  type SimulationConfig,
  type SimulationSnapshot,
  type ActiveRequest,
  type CriticalEvents,
  PodState,
} from './types';
import { MinHeap } from './priority-queue';
import { Pod } from './pod';
import { LoadBalancer, RoundRobinStrategy } from './load-balancer';
import { MetricsCollector } from './metrics';
import { CriticalEventTracker } from './CriticalEventTracker';
import { createRng, selectProfile } from './rng';

export class SimulationEngine {
  private clock: number = 0;
  private eventQueue: MinHeap<SimEvent>;
  private pods: Pod[];
  private loadBalancer: LoadBalancer;
  private metrics: MetricsCollector;
  private criticalEvents: CriticalEventTracker;
  private rng: () => number;
  private config: SimulationConfig;
  private nextRequestId: number = 1;
  private nextArrivalTime: number = 0;
  private rps: number;
  private phase: 'running' | 'stopped_requests' | 'recovered' | 'finished' = 'running';

  // Track request metadata for response time and profile recording
  private requestMeta: Map<number, { arrivalTime: number; profileName: string }> = new Map();

  // Cumulative stats
  private totalRequests: number = 0;
  private total503s: number = 0;

  private static readonly MAX_EVENTS_PER_STEP = 50000;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.rps = config.rps;
    this.rng = createRng(config.seed);
    this.eventQueue = new MinHeap<SimEvent>((a, b) => a.time - b.time);
    this.metrics = new MetricsCollector();
    this.criticalEvents = new CriticalEventTracker();

    this.pods = [];
    for (let i = 0; i < config.podCount; i++) {
      this.pods.push(new Pod(
        i,
        config.workersPerPod,
        config.maxBacklogPerPod,
        config.livenessProbe,
        config.readinessProbe,
      ));
    }

    this.loadBalancer = new LoadBalancer(this.pods, new RoundRobinStrategy());
    this.scheduleInitialEvents();
  }

  private scheduleInitialEvents(): void {
    if (this.rps > 0) {
      this.eventQueue.push({ time: 0, type: 'REQUEST_ARRIVAL' });
    }

    for (const pod of this.pods) {
      this.eventQueue.push({
        time: 0,
        type: 'LIVENESS_PROBE',
        podId: pod.id,
        probeType: 'liveness',
        generation: pod.generation,
      });
      this.eventQueue.push({
        time: 0,
        type: 'READINESS_PROBE',
        podId: pod.id,
        probeType: 'readiness',
        generation: pod.generation,
      });
    }
  }

  step(deltaMs: number): void {
    const targetTime = this.clock + Math.round(deltaMs);
    let eventsProcessed = 0;

    while (
      !this.eventQueue.isEmpty() &&
      this.eventQueue.peek().time <= targetTime &&
      eventsProcessed < SimulationEngine.MAX_EVENTS_PER_STEP
    ) {
      const event = this.eventQueue.pop();
      this.clock = event.time;
      this.processEvent(event);
      eventsProcessed++;
    }

    this.clock = targetTime;

    const activeWorkers = this.countActiveWorkers();
    const totalWorkers = this.config.podCount * this.config.workersPerPod;
    const readyCount = this.loadBalancer.getReadyCount();
    this.metrics.maybeSample(this.clock, readyCount, activeWorkers, totalWorkers);

    if (this.phase === 'stopped_requests' && readyCount === this.config.podCount) {
      this.phase = 'recovered';
      this.criticalEvents.recordRecovered(this.clock);
    }
  }

  private processEvent(event: SimEvent): void {
    // Tombstone check: skip events from previous pod generation
    if (event.podId !== undefined && event.generation !== undefined) {
      const pod = this.pods[event.podId];
      if (event.generation !== pod.generation) {
        // Clean up requestMeta for stale REQUEST_COMPLETE events
        if (event.type === 'REQUEST_COMPLETE' && event.requestId !== undefined) {
          this.requestMeta.delete(event.requestId);
        }
        return;
      }
    }

    switch (event.type) {
      case 'REQUEST_ARRIVAL':
        this.handleRequestArrival();
        break;
      case 'REQUEST_COMPLETE':
        this.handleRequestComplete(event);
        break;
      case 'LIVENESS_PROBE':
      case 'READINESS_PROBE':
        this.handleProbe(event);
        break;
      case 'PROBE_TIMEOUT':
        this.handleProbeTimeout(event);
        break;
      case 'PROBE_COMPLETE':
        this.handleProbeComplete(event);
        break;
      case 'POD_RESTART':
        this.handlePodRestart(event);
        break;
      case 'POD_INIT_COMPLETE':
        this.handlePodInitComplete(event);
        break;
    }
  }

  private handleRequestArrival(): void {
    this.totalRequests++;
    const profile = selectProfile(this.config.requestProfiles, this.rng());
    const requestId = this.nextRequestId++;

    const targetPod = this.loadBalancer.selectPod();
    if (!targetPod) {
      this.total503s++;
      this.metrics.record({ type: 'request_503' });
    } else {
      const request: ActiveRequest = {
        requestId,
        profileName: profile.name,
        profileColor: profile.color,
        startTime: this.clock,
        endTime: this.clock + profile.latencyMs,
        isProbe: false,
      };

      this.requestMeta.set(requestId, { arrivalTime: this.clock, profileName: profile.name });

      const result = targetPod.tryAccept(request);
      if (result.status === 'assigned') {
        this.eventQueue.push({
          time: request.endTime,
          type: 'REQUEST_COMPLETE',
          podId: targetPod.id,
          requestId,
          workerIndex: result.workerIndex,
          generation: targetPod.generation,
        });
      } else if (result.status === 'queued') {
        // Backlog -- completion scheduled when dequeued to worker
      } else {
        this.total503s++;
        this.metrics.record({ type: 'request_503' });
        this.requestMeta.delete(requestId);
      }
    }

    // Self-schedule next arrival
    if (this.rps > 0) {
      // Keep a fractional arrival clock so the engine can model >1000 RPS.
      // Multiple arrivals may share the same integer millisecond bucket.
      this.nextArrivalTime += 1000 / this.rps;
      this.eventQueue.push({
        time: Math.max(this.clock, Math.floor(this.nextArrivalTime + Number.EPSILON)),
        type: 'REQUEST_ARRIVAL',
      });
    }
  }

  private handleRequestComplete(event: SimEvent): void {
    const pod = this.pods[event.podId!];
    const dequeued = pod.completeRequest(event.workerIndex!, this.clock);

    // Record metrics for completed request
    const meta = this.requestMeta.get(event.requestId!);
    if (meta) {
      this.metrics.record({
        type: 'request_complete',
        profileName: meta.profileName,
        responseTime: this.clock - meta.arrivalTime,
      });
      this.requestMeta.delete(event.requestId!);
    }

    this.scheduleDequeuedItem(pod, dequeued);
  }

  private handleProbe(event: SimEvent): void {
    const pod = this.pods[event.podId!];
    const probeType = event.probeType!;
    const requestId = this.nextRequestId++;

    const probeRequest: ActiveRequest = {
      requestId,
      profileName: `${probeType}_probe`,
      profileColor: '#888888',
      startTime: this.clock,
      endTime: this.clock + 1, // 1ms processing per D-07
      isProbe: true,
      probeType,
    };

    const result = pod.tryAccept(probeRequest);
    const probeConfig = probeType === 'liveness' ? this.config.livenessProbe : this.config.readinessProbe;

    if (result.status === 'assigned') {
      this.eventQueue.push({
        time: probeRequest.endTime,
        type: 'PROBE_COMPLETE',
        podId: pod.id,
        requestId,
        workerIndex: result.workerIndex,
        probeType,
        generation: pod.generation,
      });
      // Timeout from send time (HC-03)
      this.eventQueue.push({
        time: this.clock + probeConfig.timeoutSeconds * 1000,
        type: 'PROBE_TIMEOUT',
        podId: pod.id,
        requestId,
        probeType,
        generation: pod.generation,
      });
    } else if (result.status === 'queued') {
      // Probe in backlog -- timeout starts from send time (HC-03)
      this.eventQueue.push({
        time: this.clock + probeConfig.timeoutSeconds * 1000,
        type: 'PROBE_TIMEOUT',
        podId: pod.id,
        requestId,
        probeType,
        generation: pod.generation,
      });
    } else {
      // Rejected (backlog full) -> immediate failure (HC-04, D-09)
      this.handleProbeFailure(pod, probeType);
    }
  }

  private handleProbeComplete(event: SimEvent): void {
    const pod = this.pods[event.podId!];
    const probeType = event.probeType!;

    const dequeued = pod.completeRequest(event.workerIndex!, this.clock);

    // Record probe success
    const probeResult = pod.recordProbeResult(probeType, true);
    this.handleProbeAction(pod, probeResult);

    // Schedule next probe: periodSeconds after completion (D-08, HC-08)
    this.scheduleNextProbe(pod, probeType);

    this.scheduleDequeuedItem(pod, dequeued);
  }

  private handleProbeTimeout(event: SimEvent): void {
    const pod = this.pods[event.podId!];
    const probeType = event.probeType!;

    // Check if probe is still pending (in worker or backlog)
    const stillPending = this.isProbeStillPending(pod, event.requestId!);
    if (!stillPending) {
      // Probe already completed -- timeout is stale, do nothing
      return;
    }

    // Remove probe from backlog if it's there
    this.removeFromBacklog(pod, event.requestId!);
    // Note: if probe is in a worker slot, we leave the worker occupied
    // (the PROBE_COMPLETE event will become stale via generation or requestId mismatch)
    // Actually, the worker will still process the probe to completion; the timeout just
    // means we count it as failure NOW and don't wait for completion.
    // We need to also remove it from worker if it's there (free the slot).
    this.removeFromWorker(pod, event.requestId!);

    this.handleProbeFailure(pod, probeType);
  }

  private handlePodRestart(event: SimEvent): void {
    const pod = this.pods[event.podId!];
    this.criticalEvents.recordLivenessRestart(this.clock, pod.id);

    // Collect request IDs BEFORE restart clears workers/backlog
    for (const worker of pod.workers) {
      if (worker && !worker.isProbe) {
        this.requestMeta.delete(worker.requestId);
      }
    }
    for (const item of pod.backlog) {
      if (!item.isProbe) {
        this.requestMeta.delete(item.requestId);
      }
    }

    const droppedCount = pod.restart();

    if (droppedCount > 0) {
      this.metrics.record({ type: 'dropped_by_restart', count: droppedCount });
    }

    // Schedule init complete
    this.eventQueue.push({
      time: this.clock + this.config.initializeTimeMs,
      type: 'POD_INIT_COMPLETE',
      podId: pod.id,
      generation: pod.generation,
    });
  }

  private handlePodInitComplete(event: SimEvent): void {
    const pod = this.pods[event.podId!];
    pod.initComplete();

    // Resume probes after init
    this.eventQueue.push({
      time: this.clock,
      type: 'LIVENESS_PROBE',
      podId: pod.id,
      probeType: 'liveness',
      generation: pod.generation,
    });
    this.eventQueue.push({
      time: this.clock,
      type: 'READINESS_PROBE',
      podId: pod.id,
      probeType: 'readiness',
      generation: pod.generation,
    });
  }

  // --- Helper Methods ---

  private handleProbeFailure(pod: Pod, probeType: 'liveness' | 'readiness'): void {
    const probeResult = pod.recordProbeResult(probeType, false);
    this.handleProbeAction(pod, probeResult);
    this.scheduleNextProbe(pod, probeType);
  }

  private handleProbeAction(pod: Pod, probeResult: { action: string }): void {
    if (probeResult.action === 'restart') {
      this.eventQueue.push({
        time: this.clock,
        type: 'POD_RESTART',
        podId: pod.id,
        generation: pod.generation,
      });
    }
    if (probeResult.action === 'remove_from_lb') {
      this.criticalEvents.recordReadinessFailure(this.clock, pod.id);
      if (this.loadBalancer.getReadyCount() === 0) {
        this.criticalEvents.recordAllPodsDown(this.clock);
      }
    }
    // remove_from_lb and add_to_lb are handled by Pod.recordProbeResult
    // changing pod.state. LB reads pod.state on selectPod.
  }

  private scheduleNextProbe(pod: Pod, probeType: 'liveness' | 'readiness'): void {
    if (pod.state === PodState.RESTARTING) return;

    const probeConfig = probeType === 'liveness' ? this.config.livenessProbe : this.config.readinessProbe;
    this.eventQueue.push({
      time: this.clock + probeConfig.periodSeconds * 1000,
      type: probeType === 'liveness' ? 'LIVENESS_PROBE' : 'READINESS_PROBE',
      podId: pod.id,
      probeType,
      generation: pod.generation,
    });
  }

  private isProbeStillPending(pod: Pod, requestId: number): boolean {
    for (const worker of pod.workers) {
      if (worker && worker.requestId === requestId && worker.isProbe) return true;
    }
    for (const item of pod.backlog) {
      if (item.requestId === requestId && item.isProbe) return true;
    }
    return false;
  }

  private removeFromBacklog(pod: Pod, requestId: number): void {
    const index = pod.backlog.findIndex(item => item.requestId === requestId);
    if (index >= 0) {
      pod.backlog.splice(index, 1);
    }
  }

  private removeFromWorker(pod: Pod, requestId: number): void {
    for (let i = 0; i < pod.workers.length; i++) {
      if (pod.workers[i] && pod.workers[i]!.requestId === requestId) {
        pod.workers[i] = null;
        // Dequeue from backlog if there's something waiting
        if (pod.backlog.length > 0) {
          const next = pod.backlog.shift()!;
          pod.workers[i] = next;
          this.scheduleDequeuedItem(pod, next);
        }
        break;
      }
    }
  }

  private scheduleDequeuedItem(pod: Pod, dequeued: ActiveRequest | null): void {
    if (!dequeued) return;

    const workerIndex = pod.workers.findIndex(w => w !== null && w.requestId === dequeued.requestId);
    if (workerIndex >= 0) {
      // Recalculate endTime: request was waiting in backlog, so processing
      // starts now (this.clock), not at the original startTime.
      const latencyMs = dequeued.endTime - dequeued.startTime;
      dequeued.startTime = this.clock;
      dequeued.endTime = this.clock + latencyMs;

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

  private countActiveWorkers(): number {
    let count = 0;
    for (const pod of this.pods) {
      for (const worker of pod.workers) {
        if (worker !== null) count++;
      }
    }
    return count;
  }

  // --- Public API ---

  stopRequests(): void {
    this.rps = 0;
    if (this.phase === 'running') {
      this.phase = 'stopped_requests';
      this.criticalEvents.recordStopRequests(this.clock);
    }
  }

  getSnapshot(): SimulationSnapshot {
    return {
      clock: this.clock,
      pods: this.pods.map(p => p.getSnapshot(this.clock)),
      stats: {
        totalRequests: this.totalRequests,
        total503s: this.total503s,
        droppedByRestart: this.metrics.droppedByRestart,
        readyPodCount: this.loadBalancer.getReadyCount(),
        activeWorkerCount: this.countActiveWorkers(),
        totalWorkerCount: this.config.podCount * this.config.workersPerPod,
      },
      metrics: this.metrics.getSamples(),
      phase: this.phase,
    };
  }

  getCriticalEvents(): CriticalEvents {
    return this.criticalEvents.getEvents();
  }

  getClock(): number {
    return this.clock;
  }

  getEventQueueSize(): number {
    return this.eventQueue.size;
  }

  getCumulativePerProfileResponseTime(): Record<string, { sum: number; count: number }> {
    return this.metrics.getCumulativePerProfileResponseTime();
  }
}
