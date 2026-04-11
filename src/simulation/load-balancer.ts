import { type LoadBalancerStrategy, PodState } from './types';
import { Pod } from './pod';

export class RoundRobinStrategy implements LoadBalancerStrategy {
  name = 'round-robin';
  private index: number = 0;

  selectPod(readyPodIds: number[]): number {
    const id = readyPodIds[this.index % readyPodIds.length];
    this.index++;
    return id;
  }

  reset(): void {
    this.index = 0;
  }
}

export class LoadBalancer {
  private strategy: LoadBalancerStrategy;
  private pods: Pod[];
  private lastReadySetKey: string = '';

  constructor(pods: Pod[], strategy: LoadBalancerStrategy) {
    this.pods = pods;
    this.strategy = strategy;
  }

  selectPod(): Pod | null {
    const readyPods = this.pods.filter(p => p.state === PodState.READY);
    if (readyPods.length === 0) {
      return null;
    }

    const readyPodIds = readyPods.map(p => p.id).sort((a, b) => a - b);
    const key = readyPodIds.join(',');

    if (key !== this.lastReadySetKey) {
      this.strategy.reset();
      this.lastReadySetKey = key;
    }

    const selectedId = this.strategy.selectPod(readyPodIds);
    return this.pods.find(p => p.id === selectedId) ?? null;
  }

  getReadyPods(): Pod[] {
    return this.pods.filter(p => p.state === PodState.READY);
  }

  getReadyCount(): number {
    return this.pods.filter(p => p.state === PodState.READY).length;
  }
}
