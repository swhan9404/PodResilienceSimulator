import type { CriticalEvents } from './types';

export class CriticalEventTracker {
  private events: CriticalEvents = {
    firstReadinessFailure: null,
    firstReadinessFailurePodId: null,
    firstLivenessRestart: null,
    firstLivenessRestartPodId: null,
    allPodsDown: null,
    stopRequestsTime: null,
    recoveredTime: null,
  };

  recordReadinessFailure(clock: number, podId: number): void {
    if (this.events.firstReadinessFailure === null) {
      this.events.firstReadinessFailure = clock;
      this.events.firstReadinessFailurePodId = podId;
    }
  }

  recordLivenessRestart(clock: number, podId: number): void {
    if (this.events.firstLivenessRestart === null) {
      this.events.firstLivenessRestart = clock;
      this.events.firstLivenessRestartPodId = podId;
    }
  }

  recordAllPodsDown(clock: number): void {
    if (this.events.allPodsDown === null) {
      this.events.allPodsDown = clock;
    }
  }

  recordStopRequests(clock: number): void {
    this.events.stopRequestsTime = clock;
  }

  recordRecovered(clock: number): void {
    this.events.recoveredTime = clock;
  }

  getEvents(): CriticalEvents {
    return { ...this.events };
  }
}
