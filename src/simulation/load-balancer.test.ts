import { describe, it, expect } from 'vitest';
import { LoadBalancer, RoundRobinStrategy } from './load-balancer';
import { Pod } from './pod';
import { PodState } from './types';
import type { ProbeConfig } from './types';

function makeProbeConfig(): ProbeConfig {
  return {
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 3,
    successThreshold: 1,
  };
}

function createPods(count: number): Pod[] {
  return Array.from({ length: count }, (_, i) =>
    new Pod(i, 4, 10, makeProbeConfig(), makeProbeConfig())
  );
}

// =========================================================
// LB-01: Round-robin to READY only
// =========================================================
describe('LB-01: Round-robin to READY pods only', () => {
  it('distributes requests in round-robin: pod0, pod1, pod2, pod0, pod1, pod2', () => {
    const pods = createPods(3);
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      results.push(lb.selectPod()!.id);
    }
    expect(results).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('skips NOT_READY pod: pod0, pod2, pod0, pod2', () => {
    const pods = createPods(3);
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    // Set pod1 to NOT_READY
    pods[1].state = PodState.NOT_READY;

    const results: number[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(lb.selectPod()!.id);
    }
    expect(results).toEqual([0, 2, 0, 2]);
  });
});

// =========================================================
// LB-02: All not-ready -> null
// =========================================================
describe('LB-02: All not-ready returns null', () => {
  it('returns null when all pods NOT_READY', () => {
    const pods = createPods(3);
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    pods[0].state = PodState.NOT_READY;
    pods[1].state = PodState.NOT_READY;
    pods[2].state = PodState.NOT_READY;

    expect(lb.selectPod()).toBeNull();
  });

  it('returns null when all pods RESTARTING', () => {
    const pods = createPods(3);
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    pods.forEach(p => p.restart());

    expect(lb.selectPod()).toBeNull();
  });
});

// =========================================================
// LB-03: Strategy pattern interface
// =========================================================
describe('LB-03: Strategy pattern', () => {
  it('RoundRobinStrategy has name, selectPod, reset', () => {
    const strategy = new RoundRobinStrategy();
    expect(strategy.name).toBe('round-robin');
    expect(typeof strategy.selectPod).toBe('function');
    expect(typeof strategy.reset).toBe('function');
  });

  it('LoadBalancer accepts custom strategy', () => {
    const pods = createPods(2);
    const customStrategy = {
      name: 'always-first',
      selectPod(readyPodIds: number[]): number {
        return readyPodIds[0];
      },
      reset(): void {},
    };
    const lb = new LoadBalancer(pods, customStrategy);

    // Always returns first ready pod
    expect(lb.selectPod()!.id).toBe(0);
    expect(lb.selectPod()!.id).toBe(0);
    expect(lb.selectPod()!.id).toBe(0);
  });
});

// =========================================================
// Pitfall #7: RR index reset on composition change
// =========================================================
describe('Pitfall #7: RR index resets on ready-set composition change', () => {
  it('resets index when pod leaves ready set', () => {
    const pods = createPods(3);
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    // RR: pod0, pod1
    expect(lb.selectPod()!.id).toBe(0);
    expect(lb.selectPod()!.id).toBe(1);

    // pod1 goes NOT_READY -> composition changes
    pods[1].state = PodState.NOT_READY;

    // After reset, should start from beginning of new ready set [0, 2]
    // Without reset, index would be 2, which mod 2 = 0, giving pod0, but then pod2
    // With reset, index is 0 -> pod0, then pod2
    expect(lb.selectPod()!.id).toBe(0);
    expect(lb.selectPod()!.id).toBe(2);
  });

  it('resets index when pod joins ready set', () => {
    const pods = createPods(3);
    pods[1].state = PodState.NOT_READY;
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    // Only pods 0 and 2 are ready
    expect(lb.selectPod()!.id).toBe(0);
    expect(lb.selectPod()!.id).toBe(2);

    // pod1 recovers -> composition changes
    pods[1].state = PodState.READY;

    // After reset, start from beginning of [0, 1, 2]
    expect(lb.selectPod()!.id).toBe(0);
    expect(lb.selectPod()!.id).toBe(1);
    expect(lb.selectPod()!.id).toBe(2);
  });
});

// =========================================================
// Recovery: Pod goes NOT_READY then back to READY
// =========================================================
describe('Recovery: Pod rejoins after becoming READY again', () => {
  it('pod receives traffic again after recovery', () => {
    const pods = createPods(2);
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    // Normal distribution
    expect(lb.selectPod()!.id).toBe(0);
    expect(lb.selectPod()!.id).toBe(1);

    // pod1 goes NOT_READY
    pods[1].state = PodState.NOT_READY;
    expect(lb.selectPod()!.id).toBe(0); // only pod0
    expect(lb.selectPod()!.id).toBe(0);

    // pod1 recovers
    pods[1].state = PodState.READY;
    // After composition change reset, should distribute to both
    const results: number[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(lb.selectPod()!.id);
    }
    expect(results).toEqual([0, 1, 0, 1]);
  });
});

// =========================================================
// Single pod
// =========================================================
describe('Single pod: always returns that pod', () => {
  it('always selects the only ready pod', () => {
    const pods = createPods(1);
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    for (let i = 0; i < 5; i++) {
      expect(lb.selectPod()!.id).toBe(0);
    }
  });
});

// =========================================================
// Helper methods
// =========================================================
describe('Helper methods', () => {
  it('getReadyPods returns only READY pods', () => {
    const pods = createPods(3);
    pods[1].state = PodState.NOT_READY;
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    const ready = lb.getReadyPods();
    expect(ready.length).toBe(2);
    expect(ready.map(p => p.id)).toEqual([0, 2]);
  });

  it('getReadyCount returns count of READY pods', () => {
    const pods = createPods(3);
    pods[0].restart();
    const lb = new LoadBalancer(pods, new RoundRobinStrategy());

    expect(lb.getReadyCount()).toBe(2);
  });
});
