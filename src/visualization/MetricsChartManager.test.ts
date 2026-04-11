import { describe, it, expect } from 'vitest';
import { MetricsChartManager } from './MetricsChartManager';
import type { MetricsSample } from '../simulation/types';

const makeSample = (overrides: Partial<MetricsSample> = {}): MetricsSample => ({
  time: 1000,
  totalRequests: 10,
  total503s: 0,
  droppedByRestart: 0,
  readyPodCount: 5,
  activeWorkerCount: 10,
  totalWorkerCount: 20,
  perProfileResponseTime: {},
  ...overrides,
});

describe('MetricsChartManager', () => {
  it('returns empty AlignedData for all charts when samples is empty', () => {
    const mgr = new MetricsChartManager(['normal', 'slow']);

    expect(mgr.getChartData('workerUsage', [], 0)).toEqual([[], []]);
    expect(mgr.getChartData('readyPods', [], 0)).toEqual([[], []]);
    expect(mgr.getChartData('rate503', [], 0)).toEqual([[], []]);
    // response time with 2 profiles -> [[], [], []]
    expect(mgr.getChartData('responseTime', [], 0)).toEqual([[], [], []]);
  });

  it('computes worker usage as (activeWorkerCount / totalWorkerCount) * 100', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [makeSample({ time: 1000, activeWorkerCount: 10, totalWorkerCount: 20 })];
    const [, values] = mgr.getChartData('workerUsage', samples, 1000);
    expect(values).toEqual([50]);
  });

  it('computes worker usage as 0 when totalWorkerCount is 0', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [makeSample({ time: 1000, activeWorkerCount: 0, totalWorkerCount: 0 })];
    const [, values] = mgr.getChartData('workerUsage', samples, 1000);
    expect(values).toEqual([0]);
  });

  it('computes 503 rate as (total503s / (totalRequests + total503s)) * 100', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [makeSample({ time: 1000, total503s: 3, totalRequests: 7 })];
    const [, values] = mgr.getChartData('rate503', samples, 1000);
    expect(values).toEqual([30]);
  });

  it('computes 503 rate as 0 when no requests', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [makeSample({ time: 1000, total503s: 0, totalRequests: 0 })];
    const [, values] = mgr.getChartData('rate503', samples, 1000);
    expect(values).toEqual([0]);
  });

  it('returns readyPodCount directly for readyPods chart', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [makeSample({ time: 1000, readyPodCount: 3 })];
    const [, values] = mgr.getChartData('readyPods', samples, 1000);
    expect(values).toEqual([3]);
  });

  it('computes response time average (sum/count) per profile', () => {
    const mgr = new MetricsChartManager(['normal']);
    const samples = [
      makeSample({
        time: 1000,
        perProfileResponseTime: { normal: { sum: 400, count: 2 } },
      }),
    ];
    const [, normalValues] = mgr.getChartData('responseTime', samples, 1000);
    expect(normalValues).toEqual([200]);
  });

  it('returns null for missing profile in response time', () => {
    const mgr = new MetricsChartManager(['normal', 'slow']);
    const samples = [
      makeSample({
        time: 1000,
        perProfileResponseTime: { normal: { sum: 400, count: 2 } },
      }),
    ];
    const data = mgr.getChartData('responseTime', samples, 1000);
    // [timeArr, normalArr, slowArr]
    expect(data[1]).toEqual([200]); // normal: 400/2
    expect(data[2]).toEqual([null]); // slow: missing -> null
  });

  it('converts time values to seconds (divides by 1000)', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [makeSample({ time: 5000 })];
    const [timeValues] = mgr.getChartData('workerUsage', samples, 5000);
    expect(timeValues).toEqual([5]);
  });

  it('applies 60-second sliding window based on currentClockMs', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [
      makeSample({ time: 1000, readyPodCount: 1 }),
      makeSample({ time: 50000, readyPodCount: 2 }),
      makeSample({ time: 61000, readyPodCount: 3 }),
    ];

    // With currentClock=61000, window starts at 1000ms. All 3 included.
    const data1 = mgr.getChartData('readyPods', samples, 61000);
    expect(data1[0]).toHaveLength(3);
    expect(data1[1]).toEqual([1, 2, 3]);

    // With currentClock=62000, window starts at 2000ms. First sample (t=1000) excluded.
    const data2 = mgr.getChartData('readyPods', samples, 62000);
    expect(data2[0]).toHaveLength(2);
    expect(data2[1]).toEqual([2, 3]);
  });

  it('produces AlignedData with correct x-axis from multiple samples', () => {
    const mgr = new MetricsChartManager([]);
    const samples = [
      makeSample({ time: 1000 }),
      makeSample({ time: 2000 }),
      makeSample({ time: 3000 }),
    ];
    const [timeValues] = mgr.getChartData('workerUsage', samples, 3000);
    expect(timeValues).toEqual([1, 2, 3]);
  });
});
