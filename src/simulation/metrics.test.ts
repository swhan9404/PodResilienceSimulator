import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from './metrics';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('flush at 1-second boundary', () => {
    it('emits 1 sample when currentTime crosses 1000ms', () => {
      collector.record({ type: 'request_complete', profileName: 'normal', responseTime: 100 });
      collector.record({ type: 'request_complete', profileName: 'normal', responseTime: 200 });
      collector.record({ type: 'request_complete', profileName: 'normal', responseTime: 300 });

      collector.maybeSample(1000, 3, 4, 12);

      const samples = collector.getSamples();
      expect(samples).toHaveLength(1);
      expect(samples[0].totalRequests).toBe(3);
      expect(samples[0].time).toBe(1000);
    });

    it('does not emit sample before 1000ms', () => {
      collector.record({ type: 'request_complete', profileName: 'fast', responseTime: 50 });
      collector.maybeSample(999, 3, 4, 12);

      expect(collector.getSamples()).toHaveLength(0);
    });
  });

  describe('multi-second jump (while loop)', () => {
    it('emits 3 samples for maybeSample(3500) from time 0', () => {
      collector.record({ type: 'request_complete', profileName: 'slow', responseTime: 500 });
      collector.record({ type: 'request_503' });

      collector.maybeSample(3500, 3, 4, 12);

      const samples = collector.getSamples();
      expect(samples).toHaveLength(3);
      expect(samples[0].time).toBe(1000);
      expect(samples[1].time).toBe(2000);
      expect(samples[2].time).toBe(3000);

      // First sample has the events recorded before the flush
      expect(samples[0].totalRequests).toBe(1);
      expect(samples[0].total503s).toBe(1);

      // Subsequent samples have zeros (bucket was reset after first flush)
      expect(samples[1].totalRequests).toBe(0);
      expect(samples[1].total503s).toBe(0);
      expect(samples[2].totalRequests).toBe(0);
      expect(samples[2].total503s).toBe(0);
    });
  });

  describe('bucket reset after flush', () => {
    it('resets bucket counters after each flush', () => {
      collector.record({ type: 'request_complete', profileName: 'a', responseTime: 100 });
      collector.record({ type: 'request_complete', profileName: 'b', responseTime: 200 });
      collector.maybeSample(1000, 3, 4, 12);

      collector.record({ type: 'request_complete', profileName: 'c', responseTime: 300 });
      collector.maybeSample(2000, 3, 4, 12);

      const samples = collector.getSamples();
      expect(samples).toHaveLength(2);
      expect(samples[0].totalRequests).toBe(2);
      expect(samples[1].totalRequests).toBe(1);
    });
  });

  describe('running totals accumulation', () => {
    it('accumulates running totals across flushes', () => {
      collector.record({ type: 'request_complete', profileName: 'a', responseTime: 100 });
      collector.record({ type: 'request_complete', profileName: 'b', responseTime: 100 });
      collector.record({ type: 'request_complete', profileName: 'c', responseTime: 100 });
      collector.record({ type: 'request_complete', profileName: 'd', responseTime: 100 });
      collector.record({ type: 'request_complete', profileName: 'e', responseTime: 100 });
      collector.record({ type: 'request_503' });
      collector.record({ type: 'request_503' });
      collector.record({ type: 'request_503' });
      collector.record({ type: 'dropped_by_restart', count: 7 });

      expect(collector.totalRequests).toBe(5);
      expect(collector.total503s).toBe(3);
      expect(collector.droppedByRestart).toBe(7);
    });

    it('running totals keep growing after flushes', () => {
      collector.record({ type: 'request_complete', profileName: 'a', responseTime: 100 });
      collector.maybeSample(1000, 3, 4, 12);

      collector.record({ type: 'request_complete', profileName: 'b', responseTime: 200 });
      collector.maybeSample(2000, 3, 4, 12);

      expect(collector.totalRequests).toBe(2);
    });
  });

  describe('perProfileResponseTime', () => {
    it('tracks per-profile response time sum and count', () => {
      collector.record({ type: 'request_complete', profileName: 'slow', responseTime: 5000 });
      collector.record({ type: 'request_complete', profileName: 'slow', responseTime: 3000 });
      collector.record({ type: 'request_complete', profileName: 'fast', responseTime: 50 });

      collector.maybeSample(1000, 3, 4, 12);

      const samples = collector.getSamples();
      expect(samples[0].perProfileResponseTime['slow']).toEqual({ sum: 8000, count: 2 });
      expect(samples[0].perProfileResponseTime['fast']).toEqual({ sum: 50, count: 1 });
    });
  });

  describe('dropped_by_restart with count', () => {
    it('increments bucket and running total by count', () => {
      collector.record({ type: 'dropped_by_restart', count: 5 });

      collector.maybeSample(1000, 3, 4, 12);

      const samples = collector.getSamples();
      expect(samples[0].droppedByRestart).toBe(5);
      expect(collector.droppedByRestart).toBe(5);
    });

    it('defaults count to 1 when not specified', () => {
      collector.record({ type: 'dropped_by_restart' });

      expect(collector.droppedByRestart).toBe(1);
    });
  });

  describe('getSamples returns ordered samples', () => {
    it('returns samples in time order', () => {
      collector.record({ type: 'request_complete', profileName: 'a', responseTime: 100 });
      collector.maybeSample(1000, 3, 4, 12);

      collector.record({ type: 'request_503' });
      collector.maybeSample(2000, 2, 3, 12);

      collector.record({ type: 'request_complete', profileName: 'b', responseTime: 200 });
      collector.maybeSample(3000, 3, 4, 12);

      const samples = collector.getSamples();
      expect(samples).toHaveLength(3);
      expect(samples[0].time).toBe(1000);
      expect(samples[1].time).toBe(2000);
      expect(samples[2].time).toBe(3000);
    });
  });

  describe('reset clears everything', () => {
    it('clears samples, running totals, and bucket', () => {
      collector.record({ type: 'request_complete', profileName: 'a', responseTime: 100 });
      collector.record({ type: 'request_503' });
      collector.record({ type: 'dropped_by_restart', count: 3 });
      collector.maybeSample(1000, 3, 4, 12);

      collector.reset();

      expect(collector.getSamples()).toHaveLength(0);
      expect(collector.totalRequests).toBe(0);
      expect(collector.total503s).toBe(0);
      expect(collector.droppedByRestart).toBe(0);

      // After reset, can record and flush again from time 0
      collector.record({ type: 'request_complete', profileName: 'x', responseTime: 50 });
      collector.maybeSample(1000, 1, 1, 4);

      const samples = collector.getSamples();
      expect(samples).toHaveLength(1);
      expect(samples[0].time).toBe(1000);
      expect(samples[0].totalRequests).toBe(1);
    });
  });

  describe('pod state snapshot values', () => {
    it('captures readyPodCount, activeWorkerCount, totalWorkerCount from maybeSample args', () => {
      collector.record({ type: 'request_complete', profileName: 'a', responseTime: 100 });
      collector.maybeSample(1000, 2, 6, 12);

      const samples = collector.getSamples();
      expect(samples[0].readyPodCount).toBe(2);
      expect(samples[0].activeWorkerCount).toBe(6);
      expect(samples[0].totalWorkerCount).toBe(12);
    });
  });

  describe('custom sample interval', () => {
    it('respects custom interval', () => {
      const c = new MetricsCollector(500);
      c.record({ type: 'request_complete', profileName: 'a', responseTime: 100 });
      c.maybeSample(500, 3, 4, 12);

      expect(c.getSamples()).toHaveLength(1);
      expect(c.getSamples()[0].time).toBe(500);
    });
  });
});
