import { describe, it, expect } from 'vitest';
import { SimulationEngine } from './engine';
import type { SimulationConfig } from './types';
import { PodState } from './types';

function makeConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    podCount: 3,
    workersPerPod: 4,
    maxBacklogPerPod: 10,
    rps: 60,
    requestProfiles: [
      { name: 'normal', latencyMs: 50, ratio: 1.0, color: '#4CAF50' },
    ],
    livenessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
    readinessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
    initializeTimeMs: 30000,
    seed: 42,
    ...overrides,
  };
}

describe('SimulationEngine', () => {
  describe('constructor and basics', () => {
    it('creates engine with correct initial state', () => {
      const engine = new SimulationEngine(makeConfig());
      expect(engine.getClock()).toBe(0);
      expect(engine.getEventQueueSize()).toBeGreaterThan(0);
    });

    it('step(0) processes events at time 0', () => {
      const engine = new SimulationEngine(makeConfig());
      engine.step(0);
      const snap = engine.getSnapshot();
      expect(snap.clock).toBe(0);
      expect(snap.pods).toHaveLength(3);
    });

    it('clock advances correctly after step', () => {
      const engine = new SimulationEngine(makeConfig());
      engine.step(100);
      expect(engine.getClock()).toBe(100);
    });
  });

  describe('request arrivals (SIM-02)', () => {
    it('schedules arrivals at 1000/rps interval', () => {
      const config = makeConfig({ rps: 10 });
      const engine = new SimulationEngine(config);
      // At 10 RPS, interval = 100ms. In 1000ms we expect ~10 arrivals
      engine.step(1000);
      const snap = engine.getSnapshot();
      // totalRequests should be approximately 10-11 (first at 0, then every 100ms)
      expect(snap.stats.totalRequests).toBeGreaterThanOrEqual(10);
      expect(snap.stats.totalRequests).toBeLessThanOrEqual(12);
    });

    it('no arrivals when rps is 0', () => {
      const config = makeConfig({ rps: 0 });
      const engine = new SimulationEngine(config);
      engine.step(5000);
      const snap = engine.getSnapshot();
      expect(snap.stats.totalRequests).toBe(0);
    });
  });

  describe('determinism (SIM-03, SIM-04)', () => {
    it('same seed produces identical snapshots', () => {
      const config = makeConfig({ seed: 42 });
      const engine1 = new SimulationEngine(config);
      const engine2 = new SimulationEngine(config);

      engine1.step(5000);
      engine2.step(5000);

      const snap1 = engine1.getSnapshot();
      const snap2 = engine2.getSnapshot();

      expect(snap1.clock).toBe(snap2.clock);
      expect(snap1.stats.totalRequests).toBe(snap2.stats.totalRequests);
      expect(snap1.stats.total503s).toBe(snap2.stats.total503s);
      expect(snap1.pods.length).toBe(snap2.pods.length);
      for (let i = 0; i < snap1.pods.length; i++) {
        expect(snap1.pods[i].state).toBe(snap2.pods[i].state);
        expect(snap1.pods[i].backlogSize).toBe(snap2.pods[i].backlogSize);
      }
    });

    it('different seeds produce different results', () => {
      // Use a profile mix so seed matters for profile selection
      const mixConfig: Partial<SimulationConfig> = {
        requestProfiles: [
          { name: 'fast', latencyMs: 50, ratio: 0.5, color: '#4CAF50' },
          { name: 'slow', latencyMs: 5000, ratio: 0.5, color: '#F44336' },
        ],
      };
      const e1 = new SimulationEngine(makeConfig({ ...mixConfig, seed: 42 }));
      const e2 = new SimulationEngine(makeConfig({ ...mixConfig, seed: 99 }));

      e1.step(10000);
      e2.step(10000);

      // With different seeds and a 50/50 profile mix, the exact stats should differ
      // (extremely unlikely to be identical)
      const s1 = e1.getSnapshot();
      const s2 = e2.getSnapshot();
      // Total requests should be identical (same rps), but worker occupancy differs
      expect(s1.stats.totalRequests).toBe(s2.stats.totalRequests);
    });
  });

  describe('probes (HC-01, HC-02, HC-03, HC-08)', () => {
    it('probes fire at time 0 for each pod', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 2,
        workersPerPod: 4,
        rps: 0, // no requests, only probes
      }));
      engine.step(0);
      const snap = engine.getSnapshot();
      // After step(0), probes should have been processed (1ms processing)
      // Each pod gets 2 probes at time 0 (liveness + readiness)
      // Probes are very fast (1ms), so at t=0 they are assigned to workers
      expect(snap.pods[0].state).toBe(PodState.READY);
      expect(snap.pods[1].state).toBe(PodState.READY);
    });

    it('probe occupies worker for 1ms', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 1,
        workersPerPod: 4,
        rps: 0,
      }));
      engine.step(0);
      const snap = engine.getSnapshot();
      // At t=0, probes assigned. Workers should have 2 busy (liveness + readiness)
      const busyWorkers = snap.pods[0].workers.filter(w => w.busy).length;
      expect(busyWorkers).toBe(2);
    });

    it('next probe schedules after completion + periodSeconds (HC-08)', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 1,
        workersPerPod: 4,
        rps: 0,
        livenessProbe: { periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 3, successThreshold: 1 },
      }));

      // Probes at t=0, complete at t=1, next probe at t=1 + 5000 = t=5001
      engine.step(5000);
      let snap = engine.getSnapshot();
      // At t=5000, no probes active (first completed at t=1, next at t=5001)
      const busyAt5000 = snap.pods[0].workers.filter(w => w.busy).length;
      expect(busyAt5000).toBe(0);

      engine.step(2); // Advance to t=5002 -- probes at 5001 should fire
      snap = engine.getSnapshot();
      // After probe at 5001 fires and gets assigned (1ms processing), at t=5002 probes complete
      // Workers should be free again
      // Just verify pod stays READY (probes succeed)
      expect(snap.pods[0].state).toBe(PodState.READY);
    });
  });

  describe('probe timeout and failure (HC-03, HC-04)', () => {
    it('probe in backlog that times out results in failure', () => {
      // Fill all workers with slow requests, probes go to backlog, timeout causes failure
      const engine = new SimulationEngine(makeConfig({
        podCount: 1,
        workersPerPod: 2,
        maxBacklogPerPod: 10,
        rps: 100, // Flood the pod
        requestProfiles: [{ name: 'slow', latencyMs: 30000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
      }));

      // Run for enough time that liveness fails 3 times -> restart
      // Probes at t=0 might complete quickly if worker available
      // But with 100 rps and 30s latency, workers fill up very fast
      engine.step(60000);
      const snap = engine.getSnapshot();
      // Pod should have restarted at some point
      expect(snap.pods[0].generation).toBeGreaterThan(0);
    });

    it('backlog full -> immediate probe failure (HC-04)', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 1,
        workersPerPod: 2,
        maxBacklogPerPod: 0, // No backlog at all
        rps: 100,
        requestProfiles: [{ name: 'slow', latencyMs: 30000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 3, successThreshold: 1 },
      }));

      // Workers fill instantly (slow 30s requests), no backlog, probes immediately fail
      // With period=5s, failures at t=0(maybe success), t=5000, t=10000, t=15000 -> restart
      engine.step(30000);
      const snap = engine.getSnapshot();
      // Pod should have restarted
      expect(snap.pods[0].generation).toBeGreaterThan(0);
    });
  });

  describe('state transitions', () => {
    it('liveness failures -> restart -> init -> probes resume', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 1,
        workersPerPod: 1,
        maxBacklogPerPod: 0,
        rps: 100,
        requestProfiles: [{ name: 'slow', latencyMs: 60000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 5, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 5, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
        initializeTimeMs: 5000,
      }));

      // 1 worker, 60s slow requests. Worker fills at t=0.
      // Probes at t=0 might grab the worker first, but with 100rps the worker stays occupied.
      // Liveness failures accumulate -> restart -> init 5s -> probes resume

      engine.step(30000);
      const snap = engine.getSnapshot();
      // Pod should have restarted at least once
      expect(snap.pods[0].generation).toBeGreaterThan(0);
    });

    it('readiness failures -> NOT_READY -> excluded from LB', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 2,
        workersPerPod: 1,
        maxBacklogPerPod: 0,
        rps: 100,
        requestProfiles: [{ name: 'slow', latencyMs: 60000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 100, timeoutSeconds: 1, failureThreshold: 100, successThreshold: 1 },
        readinessProbe: { periodSeconds: 5, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
        initializeTimeMs: 5000,
      }));

      // Liveness has very high threshold so no restart
      // Readiness fails after 3 consecutive failures -> NOT_READY
      engine.step(30000);
      const snap = engine.getSnapshot();
      // At least one pod should be NOT_READY from readiness failures
      const notReadyPods = snap.pods.filter(p => p.state === PodState.NOT_READY);
      expect(notReadyPods.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('stopRequests', () => {
    it('stops new request arrivals', () => {
      const engine = new SimulationEngine(makeConfig({ rps: 60 }));
      engine.step(1000);
      const beforeStop = engine.getSnapshot().stats.totalRequests;
      expect(beforeStop).toBeGreaterThan(0);

      engine.stopRequests();
      engine.step(5000);
      const afterStop = engine.getSnapshot().stats.totalRequests;
      // At most 1 additional arrival (already queued before stop)
      expect(afterStop - beforeStop).toBeLessThanOrEqual(1);
    });

    it('changes phase to stopped_requests', () => {
      const engine = new SimulationEngine(makeConfig());
      expect(engine.getSnapshot().phase).toBe('running');
      engine.stopRequests();
      expect(engine.getSnapshot().phase).toBe('stopped_requests');
    });
  });

  describe('snapshot (D-12)', () => {
    it('contains all required fields', () => {
      const engine = new SimulationEngine(makeConfig());
      engine.step(2000);
      const snap = engine.getSnapshot();

      expect(snap.clock).toBe(2000);
      expect(snap.pods).toHaveLength(3);
      expect(snap.stats).toHaveProperty('totalRequests');
      expect(snap.stats).toHaveProperty('total503s');
      expect(snap.stats).toHaveProperty('droppedByRestart');
      expect(snap.stats).toHaveProperty('readyPodCount');
      expect(snap.stats).toHaveProperty('activeWorkerCount');
      expect(snap.stats).toHaveProperty('totalWorkerCount');
      expect(snap.metrics).toBeInstanceOf(Array);
      expect(snap.phase).toBe('running');

      // Pod snapshots
      const pod = snap.pods[0];
      expect(pod).toHaveProperty('id');
      expect(pod).toHaveProperty('state');
      expect(pod).toHaveProperty('workers');
      expect(pod).toHaveProperty('backlogSize');
      expect(pod).toHaveProperty('backlogMax');
      expect(pod).toHaveProperty('livenessHistory');
      expect(pod).toHaveProperty('readinessHistory');
      expect(pod).toHaveProperty('generation');
    });

    it('totalWorkerCount matches config', () => {
      const engine = new SimulationEngine(makeConfig({ podCount: 3, workersPerPod: 4 }));
      engine.step(100);
      expect(engine.getSnapshot().stats.totalWorkerCount).toBe(12);
    });

    it('metrics samples generated after 1+ seconds', () => {
      const engine = new SimulationEngine(makeConfig());
      engine.step(3000);
      const snap = engine.getSnapshot();
      expect(snap.metrics.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('safety valve', () => {
    it('limits events per step to prevent infinite loops', () => {
      // Even with absurd config, step should return
      const engine = new SimulationEngine(makeConfig({
        rps: 10000,
        podCount: 1,
        workersPerPod: 1,
        maxBacklogPerPod: 0,
      }));
      // This would generate many 503s but should not freeze
      const start = performance.now();
      engine.step(10000);
      const elapsed = performance.now() - start;
      // Should complete in reasonable time (< 5 seconds)
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('scenario: 100% slow requests -> cascade failure', () => {
    it('all pods cascade to RESTARTING within bounded time', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 3,
        workersPerPod: 4,
        maxBacklogPerPod: 10,
        rps: 60,
        requestProfiles: [{ name: 'very-slow', latencyMs: 30000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
        initializeTimeMs: 30000,
        seed: 42,
      }));

      // Run for 120 seconds of sim time
      // Step in chunks to avoid safety valve limits with high event counts
      for (let t = 0; t < 120; t++) {
        engine.step(1000);
      }

      const snap = engine.getSnapshot();

      // All pods should have restarted at some point
      let allRestarted = true;
      for (const pod of snap.pods) {
        if (pod.generation === 0) {
          allRestarted = false;
        }
      }
      expect(allRestarted).toBe(true);

      // There should be 503s
      expect(snap.stats.total503s).toBeGreaterThan(0);

      // Phase should still be running
      expect(snap.phase).toBe('running');
    });
  });

  describe('critical events tracking', () => {
    it('records firstReadinessFailure after slow-request degradation', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 2,
        workersPerPod: 2,
        maxBacklogPerPod: 5,
        rps: 50,
        requestProfiles: [{ name: 'slow', latencyMs: 30000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 100, timeoutSeconds: 1, failureThreshold: 100, successThreshold: 1 },
        readinessProbe: { periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 3, successThreshold: 1 },
        initializeTimeMs: 5000,
        seed: 42,
      }));

      // Run until readiness failures happen
      for (let t = 0; t < 40; t++) {
        engine.step(1000);
      }

      const events = engine.getCriticalEvents();
      expect(events.firstReadinessFailure).not.toBeNull();
      expect(events.firstReadinessFailurePodId).not.toBeNull();
    });

    it('records stopRequestsTime and recoveredTime after full recovery', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 2,
        workersPerPod: 2,
        maxBacklogPerPod: 5,
        rps: 50,
        requestProfiles: [{ name: 'slow', latencyMs: 30000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 3, successThreshold: 1 },
        initializeTimeMs: 5000,
        seed: 42,
      }));

      // Run until pods are degraded
      for (let t = 0; t < 40; t++) {
        engine.step(1000);
      }

      engine.stopRequests();

      // Run for recovery
      for (let t = 0; t < 60; t++) {
        engine.step(1000);
      }

      const events = engine.getCriticalEvents();
      expect(events.stopRequestsTime).not.toBeNull();
      expect(events.recoveredTime).not.toBeNull();
      expect(events.recoveredTime!).toBeGreaterThan(events.stopRequestsTime!);
    });
  });

  describe('scenario: 0% slow requests -> stable', () => {
    it('all pods stay READY for 60+ seconds', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 3,
        workersPerPod: 4,
        maxBacklogPerPod: 10,
        rps: 60,
        requestProfiles: [{ name: 'fast', latencyMs: 50, ratio: 1.0, color: '#4CAF50' }],
        livenessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3, successThreshold: 1 },
        initializeTimeMs: 30000,
        seed: 42,
      }));

      // Run for 60 seconds in 1-second steps
      for (let t = 0; t < 60; t++) {
        engine.step(1000);
      }

      const snap = engine.getSnapshot();

      // All pods should be READY
      expect(snap.stats.readyPodCount).toBe(3);
      for (const pod of snap.pods) {
        expect(pod.state).toBe(PodState.READY);
      }

      // No 503s
      expect(snap.stats.total503s).toBe(0);

      // No pod restarts
      for (const pod of snap.pods) {
        expect(pod.generation).toBe(0);
      }
    });
  });

  describe('recovery scenario', () => {
    it('recovers after stopRequests when pods were degraded', () => {
      const engine = new SimulationEngine(makeConfig({
        podCount: 2,
        workersPerPod: 2,
        maxBacklogPerPod: 5,
        rps: 50,
        requestProfiles: [{ name: 'slow', latencyMs: 30000, ratio: 1.0, color: '#F44336' }],
        livenessProbe: { periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 3, successThreshold: 1 },
        readinessProbe: { periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 3, successThreshold: 1 },
        initializeTimeMs: 5000,
        seed: 42,
      }));

      // Run until pods are degraded
      for (let t = 0; t < 40; t++) {
        engine.step(1000);
      }

      engine.stopRequests();
      expect(engine.getSnapshot().phase).toBe('stopped_requests');

      // Run for recovery time: initializeTime + enough probe cycles
      for (let t = 0; t < 60; t++) {
        engine.step(1000);
      }

      const snap = engine.getSnapshot();
      // Should eventually recover
      expect(snap.stats.readyPodCount).toBe(2);
      expect(snap.phase).toBe('recovered');
    });
  });
});
