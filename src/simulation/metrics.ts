import type { MetricsSample } from './types';

export interface MetricEvent {
  type: 'request_complete' | 'request_503' | 'dropped_by_restart';
  profileName?: string;
  responseTime?: number;
  count?: number;
}

interface MetricsBucket {
  totalRequests: number;
  total503s: number;
  droppedByRestart: number;
  perProfileResponseTime: Record<string, { sum: number; count: number }>;
}

export class MetricsCollector {
  private sampleIntervalMs: number;
  private lastSampleTime: number = 0;
  private samples: MetricsSample[] = [];
  private currentBucket: MetricsBucket;
  private static readonly MAX_SAMPLES = 300; // 5 minutes at 1s intervals

  totalRequests: number = 0;
  total503s: number = 0;
  droppedByRestart: number = 0;

  // Cumulative per-profile response time totals (survives sample eviction)
  cumulativePerProfileResponseTime: Record<string, { sum: number; count: number }> = {};

  constructor(sampleIntervalMs: number = 1000) {
    this.sampleIntervalMs = sampleIntervalMs;
    this.currentBucket = this.createEmptyBucket();
  }

  private createEmptyBucket(): MetricsBucket {
    return {
      totalRequests: 0,
      total503s: 0,
      droppedByRestart: 0,
      perProfileResponseTime: {},
    };
  }

  record(event: MetricEvent): void {
    switch (event.type) {
      case 'request_complete':
        this.currentBucket.totalRequests++;
        this.totalRequests++;
        if (event.profileName && event.responseTime !== undefined) {
          if (!this.currentBucket.perProfileResponseTime[event.profileName]) {
            this.currentBucket.perProfileResponseTime[event.profileName] = { sum: 0, count: 0 };
          }
          this.currentBucket.perProfileResponseTime[event.profileName].sum += event.responseTime;
          this.currentBucket.perProfileResponseTime[event.profileName].count++;
        }
        break;
      case 'request_503':
        this.currentBucket.total503s++;
        this.total503s++;
        break;
      case 'dropped_by_restart': {
        const dropCount = event.count ?? 1;
        this.currentBucket.droppedByRestart += dropCount;
        this.droppedByRestart += dropCount;
        break;
      }
    }
  }

  maybeSample(currentTime: number, readyPodCount: number, activeWorkerCount: number, totalWorkerCount: number): void {
    while (currentTime - this.lastSampleTime >= this.sampleIntervalMs) {
      this.lastSampleTime += this.sampleIntervalMs;
      const sample: MetricsSample = {
        time: this.lastSampleTime,
        totalRequests: this.currentBucket.totalRequests,
        total503s: this.currentBucket.total503s,
        droppedByRestart: this.currentBucket.droppedByRestart,
        readyPodCount,
        activeWorkerCount,
        totalWorkerCount,
        perProfileResponseTime: { ...this.currentBucket.perProfileResponseTime },
      };

      // Accumulate per-profile response time into cumulative totals before eviction
      for (const [name, data] of Object.entries(this.currentBucket.perProfileResponseTime)) {
        if (!this.cumulativePerProfileResponseTime[name]) {
          this.cumulativePerProfileResponseTime[name] = { sum: 0, count: 0 };
        }
        this.cumulativePerProfileResponseTime[name].sum += data.sum;
        this.cumulativePerProfileResponseTime[name].count += data.count;
      }

      this.samples.push(sample);

      // Evict oldest samples to cap memory usage
      if (this.samples.length > MetricsCollector.MAX_SAMPLES) {
        this.samples.splice(0, this.samples.length - MetricsCollector.MAX_SAMPLES);
      }

      this.currentBucket = this.createEmptyBucket();
    }
  }

  getSamples(): MetricsSample[] {
    return this.samples;
  }

  getCumulativePerProfileResponseTime(): Record<string, { sum: number; count: number }> {
    return this.cumulativePerProfileResponseTime;
  }

  reset(): void {
    this.samples = [];
    this.lastSampleTime = 0;
    this.currentBucket = this.createEmptyBucket();
    this.totalRequests = 0;
    this.total503s = 0;
    this.droppedByRestart = 0;
    this.cumulativePerProfileResponseTime = {};
  }
}
