import { describe, it, expect } from 'vitest';
import { CriticalEventTracker } from './CriticalEventTracker';

describe('CriticalEventTracker', () => {
  it('recordReadinessFailure sets firstReadinessFailure only on first call', () => {
    const tracker = new CriticalEventTracker();
    tracker.recordReadinessFailure(1000, 0);
    tracker.recordReadinessFailure(2000, 1);

    const events = tracker.getEvents();
    expect(events.firstReadinessFailure).toBe(1000);
    expect(events.firstReadinessFailurePodId).toBe(0);
  });

  it('recordLivenessRestart sets firstLivenessRestart only on first call', () => {
    const tracker = new CriticalEventTracker();
    tracker.recordLivenessRestart(3000, 2);
    tracker.recordLivenessRestart(4000, 1);

    const events = tracker.getEvents();
    expect(events.firstLivenessRestart).toBe(3000);
    expect(events.firstLivenessRestartPodId).toBe(2);
  });

  it('recordAllPodsDown sets allPodsDown only on first call', () => {
    const tracker = new CriticalEventTracker();
    tracker.recordAllPodsDown(5000);
    tracker.recordAllPodsDown(6000);

    const events = tracker.getEvents();
    expect(events.allPodsDown).toBe(5000);
  });

  it('recordStopRequests sets stopRequestsTime', () => {
    const tracker = new CriticalEventTracker();
    tracker.recordStopRequests(7000);

    const events = tracker.getEvents();
    expect(events.stopRequestsTime).toBe(7000);
  });

  it('recordRecovered sets recoveredTime', () => {
    const tracker = new CriticalEventTracker();
    tracker.recordRecovered(8000);

    const events = tracker.getEvents();
    expect(events.recoveredTime).toBe(8000);
  });

  it('getEvents returns all fields with correct initial values', () => {
    const tracker = new CriticalEventTracker();
    const events = tracker.getEvents();

    expect(events.firstReadinessFailure).toBeNull();
    expect(events.firstReadinessFailurePodId).toBeNull();
    expect(events.firstLivenessRestart).toBeNull();
    expect(events.firstLivenessRestartPodId).toBeNull();
    expect(events.allPodsDown).toBeNull();
    expect(events.stopRequestsTime).toBeNull();
    expect(events.recoveredTime).toBeNull();
  });
});
