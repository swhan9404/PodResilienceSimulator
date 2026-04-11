import { describe, it, expect } from 'vitest';
import { Pod } from './pod';
import type { ProbeResult } from './pod';
import { PodState } from './types';
import type { ActiveRequest, ProbeConfig } from './types';

function makeProbeConfig(overrides?: Partial<ProbeConfig>): ProbeConfig {
  return {
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 3,
    successThreshold: 1,
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<ActiveRequest>): ActiveRequest {
  return {
    requestId: 1,
    profileName: 'normal',
    profileColor: '#4CAF50',
    startTime: 0,
    endTime: 50,
    isProbe: false,
    ...overrides,
  };
}

function makeProbeRequest(probeType: 'liveness' | 'readiness', overrides?: Partial<ActiveRequest>): ActiveRequest {
  return {
    requestId: 100,
    profileName: 'probe',
    profileColor: '#999',
    startTime: 0,
    endTime: 1, // 1ms processing
    isProbe: true,
    probeType,
    ...overrides,
  };
}

function createPod(opts?: {
  id?: number;
  workers?: number;
  maxBacklog?: number;
  livenessConfig?: Partial<ProbeConfig>;
  readinessConfig?: Partial<ProbeConfig>;
}): Pod {
  return new Pod(
    opts?.id ?? 0,
    opts?.workers ?? 4,
    opts?.maxBacklog ?? 10,
    makeProbeConfig(opts?.livenessConfig),
    makeProbeConfig(opts?.readinessConfig),
  );
}

// =========================================================
// POD-01: State Machine
// =========================================================
describe('POD-01: State machine', () => {
  it('new Pod starts in READY state', () => {
    const pod = createPod();
    expect(pod.state).toBe(PodState.READY);
  });

  it('transitions READY -> NOT_READY on readiness failureThreshold', () => {
    const pod = createPod({ readinessConfig: { failureThreshold: 3 } });
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    const result = pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);
    expect(result.action).toBe('remove_from_lb');
  });

  it('transitions NOT_READY -> READY on readiness successThreshold', () => {
    const pod = createPod({ readinessConfig: { failureThreshold: 3, successThreshold: 2 } });
    // First go NOT_READY
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);

    // Then recover
    pod.recordProbeResult('readiness', true);
    const result = pod.recordProbeResult('readiness', true);
    expect(pod.state).toBe(PodState.READY);
    expect(result.action).toBe('add_to_lb');
  });

  it('transitions READY -> RESTARTING on liveness failureThreshold', () => {
    const pod = createPod({ livenessConfig: { failureThreshold: 3 } });
    pod.recordProbeResult('liveness', false);
    pod.recordProbeResult('liveness', false);
    const result = pod.recordProbeResult('liveness', false);
    expect(result.action).toBe('restart');
  });

  it('transitions NOT_READY -> RESTARTING on liveness failureThreshold', () => {
    const pod = createPod({
      readinessConfig: { failureThreshold: 2 },
      livenessConfig: { failureThreshold: 3 },
    });
    // Go NOT_READY first
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);

    // Then liveness fails
    pod.recordProbeResult('liveness', false);
    pod.recordProbeResult('liveness', false);
    const result = pod.recordProbeResult('liveness', false);
    expect(result.action).toBe('restart');
  });

  it('transitions RESTARTING -> NOT_READY after initComplete', () => {
    const pod = createPod();
    pod.restart();
    expect(pod.state).toBe(PodState.RESTARTING);
    pod.initComplete();
    expect(pod.state).toBe(PodState.NOT_READY);
  });
});

// =========================================================
// POD-02: Workers
// =========================================================
describe('POD-02: Workers', () => {
  it('Pod with 4 workers has 4 worker slots', () => {
    const pod = createPod({ workers: 4 });
    // Fill all 4 workers
    for (let i = 0; i < 4; i++) {
      const result = pod.tryAccept(makeRequest({ requestId: i }));
      expect(result.status).toBe('assigned');
      if (result.status === 'assigned') {
        expect(result.workerIndex).toBe(i);
      }
    }
  });

  it('idle worker accepts request with assigned status and workerIndex', () => {
    const pod = createPod();
    const result = pod.tryAccept(makeRequest());
    expect(result).toEqual({ status: 'assigned', workerIndex: 0 });
  });

  it('busy worker slot is not available for new requests', () => {
    const pod = createPod({ workers: 1 });
    pod.tryAccept(makeRequest({ requestId: 1 }));
    const result = pod.tryAccept(makeRequest({ requestId: 2 }));
    expect(result.status).toBe('queued');
  });
});

// =========================================================
// POD-03: Backlog
// =========================================================
describe('POD-03: Backlog', () => {
  it('when all workers busy, request goes to backlog', () => {
    const pod = createPod({ workers: 2, maxBacklog: 5 });
    pod.tryAccept(makeRequest({ requestId: 1 }));
    pod.tryAccept(makeRequest({ requestId: 2 }));
    const result = pod.tryAccept(makeRequest({ requestId: 3 }));
    expect(result).toEqual({ status: 'queued' });
  });

  it('when worker completes, next backlog item is dequeued (FIFO)', () => {
    const pod = createPod({ workers: 1, maxBacklog: 5 });
    pod.tryAccept(makeRequest({ requestId: 1, endTime: 100 }));
    pod.tryAccept(makeRequest({ requestId: 2, endTime: 200 }));
    pod.tryAccept(makeRequest({ requestId: 3, endTime: 300 }));

    // Complete the first worker
    const dequeued = pod.completeRequest(0, 100);
    expect(dequeued).not.toBeNull();
    expect(dequeued!.requestId).toBe(2); // FIFO: request 2 was queued first
  });
});

// =========================================================
// POD-04: Backlog full
// =========================================================
describe('POD-04: Backlog full', () => {
  it('when backlog at maxBacklog, new request rejected with backlog_full', () => {
    const pod = createPod({ workers: 1, maxBacklog: 2 });
    pod.tryAccept(makeRequest({ requestId: 1 })); // worker
    pod.tryAccept(makeRequest({ requestId: 2 })); // backlog 1
    pod.tryAccept(makeRequest({ requestId: 3 })); // backlog 2

    const result = pod.tryAccept(makeRequest({ requestId: 4 }));
    expect(result).toEqual({ status: 'rejected', reason: 'backlog_full' });
  });
});

// =========================================================
// POD-05: Restart drops all
// =========================================================
describe('POD-05: Restart drops all', () => {
  it('restart clears all workers and backlog, returns dropped count', () => {
    const pod = createPod({ workers: 2, maxBacklog: 3 });
    pod.tryAccept(makeRequest({ requestId: 1 })); // worker 0
    pod.tryAccept(makeRequest({ requestId: 2 })); // worker 1
    pod.tryAccept(makeRequest({ requestId: 3 })); // backlog
    pod.tryAccept(makeRequest({ requestId: 4 })); // backlog
    pod.tryAccept(makeRequest({ requestId: 5 })); // backlog

    const dropped = pod.restart();
    expect(dropped).toBe(5); // 2 workers + 3 backlog
    expect(pod.state).toBe(PodState.RESTARTING);
  });

  it('restart increments generation', () => {
    const pod = createPod();
    expect(pod.generation).toBe(0);
    pod.restart();
    expect(pod.generation).toBe(1);
    pod.initComplete();
    pod.restart();
    expect(pod.generation).toBe(2);
  });

  it('restart resets probe counters and histories', () => {
    const pod = createPod();
    pod.recordProbeResult('liveness', false);
    pod.recordProbeResult('readiness', false);
    pod.restart();
    expect(pod.livenessCounter.consecutiveFailures).toBe(0);
    expect(pod.readinessCounter.consecutiveFailures).toBe(0);
    expect(pod.livenessHistory).toEqual([]);
    expect(pod.readinessHistory).toEqual([]);
  });
});

// =========================================================
// POD-06: Init complete
// =========================================================
describe('POD-06: Init complete', () => {
  it('initComplete transitions RESTARTING -> NOT_READY', () => {
    const pod = createPod();
    pod.restart();
    pod.initComplete();
    expect(pod.state).toBe(PodState.NOT_READY);
  });

  it('initComplete resets probe counters', () => {
    const pod = createPod();
    pod.recordProbeResult('liveness', false);
    pod.restart();
    pod.initComplete();
    expect(pod.livenessCounter.consecutiveFailures).toBe(0);
    expect(pod.livenessCounter.consecutiveSuccesses).toBe(0);
    expect(pod.readinessCounter.consecutiveFailures).toBe(0);
    expect(pod.readinessCounter.consecutiveSuccesses).toBe(0);
  });
});

// =========================================================
// HC-01/HC-02: Probes use worker
// =========================================================
describe('HC-01/HC-02: Probes use worker', () => {
  it('probe uses tryAccept same as regular request', () => {
    const pod = createPod({ workers: 2 });
    const result = pod.tryAccept(makeProbeRequest('liveness'));
    expect(result.status).toBe('assigned');
  });

  it('probe goes to backlog when all workers busy', () => {
    const pod = createPod({ workers: 1 });
    pod.tryAccept(makeRequest({ requestId: 1 }));
    const result = pod.tryAccept(makeProbeRequest('liveness'));
    expect(result.status).toBe('queued');
  });
});

// =========================================================
// HC-04: Backlog full -> immediate probe failure
// =========================================================
describe('HC-04: Backlog full probe rejection', () => {
  it('when backlog full, probe request rejected with backlog_full', () => {
    const pod = createPod({ workers: 1, maxBacklog: 1 });
    pod.tryAccept(makeRequest({ requestId: 1 })); // worker
    pod.tryAccept(makeRequest({ requestId: 2 })); // backlog

    const result = pod.tryAccept(makeProbeRequest('liveness'));
    expect(result).toEqual({ status: 'rejected', reason: 'backlog_full' });
  });
});

// =========================================================
// HC-05: Liveness failures -> restart
// =========================================================
describe('HC-05: Liveness consecutive failures trigger restart', () => {
  it('3 consecutive liveness failures returns restart action', () => {
    const pod = createPod({ livenessConfig: { failureThreshold: 3 } });
    expect(pod.recordProbeResult('liveness', false).action).toBe('none');
    expect(pod.recordProbeResult('liveness', false).action).toBe('none');
    expect(pod.recordProbeResult('liveness', false).action).toBe('restart');
  });

  it('success resets consecutive failure count', () => {
    const pod = createPod({ livenessConfig: { failureThreshold: 3 } });
    pod.recordProbeResult('liveness', false);
    pod.recordProbeResult('liveness', false);
    pod.recordProbeResult('liveness', true); // resets
    pod.recordProbeResult('liveness', false);
    pod.recordProbeResult('liveness', false);
    expect(pod.recordProbeResult('liveness', false).action).toBe('restart');
  });
});

// =========================================================
// HC-06: Readiness failures -> not ready
// =========================================================
describe('HC-06: Readiness failures trigger NOT_READY', () => {
  it('3 consecutive readiness failures on READY pod transitions to NOT_READY', () => {
    const pod = createPod({ readinessConfig: { failureThreshold: 3 } });
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    const result = pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);
    expect(result.action).toBe('remove_from_lb');
  });

  it('readiness failure on NOT_READY pod does not re-trigger action', () => {
    const pod = createPod({ readinessConfig: { failureThreshold: 2 } });
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false); // -> NOT_READY
    // Further failures should return 'none'
    const result = pod.recordProbeResult('readiness', false);
    expect(result.action).toBe('none');
  });
});

// =========================================================
// HC-07: Consecutive successes -> ready
// =========================================================
describe('HC-07: Readiness successes restore READY', () => {
  it('N consecutive successes on NOT_READY transitions to READY', () => {
    const pod = createPod({
      readinessConfig: { failureThreshold: 2, successThreshold: 3 },
    });
    // Go NOT_READY
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);

    // Recover
    pod.recordProbeResult('readiness', true);
    pod.recordProbeResult('readiness', true);
    const result = pod.recordProbeResult('readiness', true);
    expect(pod.state).toBe(PodState.READY);
    expect(result.action).toBe('add_to_lb');
  });

  it('failure resets consecutive success count', () => {
    const pod = createPod({
      readinessConfig: { failureThreshold: 2, successThreshold: 3 },
    });
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);

    pod.recordProbeResult('readiness', true);
    pod.recordProbeResult('readiness', true);
    pod.recordProbeResult('readiness', false); // reset
    pod.recordProbeResult('readiness', true);
    pod.recordProbeResult('readiness', true);
    const result = pod.recordProbeResult('readiness', true);
    expect(pod.state).toBe(PodState.READY);
    expect(result.action).toBe('add_to_lb');
  });
});

// =========================================================
// Pitfall #9: NOT_READY vs RESTARTING
// =========================================================
describe('Pitfall #9: NOT_READY does NOT clear workers', () => {
  it('NOT_READY pod keeps busy workers processing', () => {
    const pod = createPod({
      workers: 4,
      readinessConfig: { failureThreshold: 2 },
    });
    // Fill workers
    pod.tryAccept(makeRequest({ requestId: 1, endTime: 1000 }));
    pod.tryAccept(makeRequest({ requestId: 2, endTime: 1000 }));
    pod.tryAccept(makeRequest({ requestId: 3, endTime: 1000 }));
    pod.tryAccept(makeRequest({ requestId: 4, endTime: 1000 }));

    // Transition to NOT_READY
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);

    // Workers should still be occupied
    const snapshot = pod.getSnapshot(500);
    const busyWorkers = snapshot.workers.filter(w => w.busy).length;
    expect(busyWorkers).toBe(4);
  });

  it('NOT_READY pod still accepts requests via tryAccept directly', () => {
    const pod = createPod({
      workers: 4,
      readinessConfig: { failureThreshold: 2 },
    });
    pod.recordProbeResult('readiness', false);
    pod.recordProbeResult('readiness', false);
    expect(pod.state).toBe(PodState.NOT_READY);

    // Direct tryAccept still works (engine controls LB routing, not pod)
    const result = pod.tryAccept(makeRequest());
    expect(result.status).toBe('assigned');
  });
});

// =========================================================
// Pitfall #15: FIFO Backlog Order
// =========================================================
describe('Pitfall #15: FIFO backlog order', () => {
  it('dequeue order is A, B, C (FIFO)', () => {
    const pod = createPod({ workers: 1, maxBacklog: 5 });
    pod.tryAccept(makeRequest({ requestId: 1, endTime: 100 })); // worker
    pod.tryAccept(makeRequest({ requestId: 10, endTime: 200 })); // backlog A
    pod.tryAccept(makeRequest({ requestId: 20, endTime: 300 })); // backlog B
    pod.tryAccept(makeRequest({ requestId: 30, endTime: 400 })); // backlog C

    // Complete worker -> dequeue A
    const a = pod.completeRequest(0, 100);
    expect(a!.requestId).toBe(10);

    // Complete worker -> dequeue B
    const b = pod.completeRequest(0, 200);
    expect(b!.requestId).toBe(20);

    // Complete worker -> dequeue C
    const c = pod.completeRequest(0, 300);
    expect(c!.requestId).toBe(30);

    // No more backlog
    const d = pod.completeRequest(0, 400);
    expect(d).toBeNull();
  });
});

// =========================================================
// RESTARTING pod rejects requests
// =========================================================
describe('RESTARTING pod behavior', () => {
  it('RESTARTING pod rejects requests with not_accepting', () => {
    const pod = createPod();
    pod.restart();
    const result = pod.tryAccept(makeRequest());
    expect(result).toEqual({ status: 'rejected', reason: 'not_accepting' });
  });
});

// =========================================================
// Snapshot
// =========================================================
describe('Snapshot', () => {
  it('getSnapshot produces correct worker progress values', () => {
    const pod = createPod({ workers: 2 });
    pod.tryAccept(makeRequest({ requestId: 1, startTime: 0, endTime: 100, profileName: 'slow', profileColor: '#FF0000' }));
    // Worker 1 idle

    const snapshot = pod.getSnapshot(50);
    expect(snapshot.id).toBe(0);
    expect(snapshot.state).toBe(PodState.READY);
    expect(snapshot.workers[0].busy).toBe(true);
    expect(snapshot.workers[0].progress).toBeCloseTo(0.5); // 50/100
    expect(snapshot.workers[0].profileName).toBe('slow');
    expect(snapshot.workers[0].profileColor).toBe('#FF0000');
    expect(snapshot.workers[1].busy).toBe(false);
    expect(snapshot.workers[1].progress).toBe(0);
    expect(snapshot.backlogSize).toBe(0);
    expect(snapshot.backlogMax).toBe(10);
    expect(snapshot.generation).toBe(0);
  });

  it('getSnapshot clamps progress between 0 and 1', () => {
    const pod = createPod({ workers: 1 });
    pod.tryAccept(makeRequest({ requestId: 1, startTime: 0, endTime: 100 }));

    // Before start
    const snap1 = pod.getSnapshot(-10);
    expect(snap1.workers[0].progress).toBe(0);

    // Past end
    const snap2 = pod.getSnapshot(200);
    expect(snap2.workers[0].progress).toBe(1);
  });

  it('getSnapshot includes probe histories', () => {
    const pod = createPod();
    pod.recordProbeResult('liveness', true);
    pod.recordProbeResult('liveness', false);
    pod.recordProbeResult('readiness', true);

    const snapshot = pod.getSnapshot(0);
    expect(snapshot.livenessHistory).toEqual([true, false]);
    expect(snapshot.readinessHistory).toEqual([true]);
  });
});
