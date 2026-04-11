import type { MetricsSample } from '../simulation/types';

export type ChartId = 'workerUsage' | 'readyPods' | 'rate503' | 'responseTime';

export type AlignedData = [number[], ...(number | null)[][]];

export class MetricsChartManager {
  private windowSeconds = 60; // D-06: fixed 60s window
  private profileNames: string[];

  constructor(profileNames: string[]) {
    this.profileNames = profileNames;
  }

  getChartData(chartId: ChartId, allSamples: MetricsSample[], currentClockMs: number): AlignedData {
    const windowStartMs = Math.max(0, currentClockMs - this.windowSeconds * 1000);
    const windowed = allSamples.filter(s => s.time >= windowStartMs);
    const timeSeconds = windowed.map(s => s.time / 1000);

    switch (chartId) {
      case 'workerUsage': {
        const values = windowed.map(s =>
          s.totalWorkerCount > 0 ? (s.activeWorkerCount / s.totalWorkerCount) * 100 : 0
        );
        return [timeSeconds, values];
      }
      case 'readyPods': {
        const values = windowed.map(s => s.readyPodCount);
        return [timeSeconds, values];
      }
      case 'rate503': {
        const values = windowed.map(s => {
          const total = s.totalRequests + s.total503s;
          return total > 0 ? (s.total503s / total) * 100 : 0;
        });
        return [timeSeconds, values];
      }
      case 'responseTime': {
        const series: (number | null)[][] = this.profileNames.map(name =>
          windowed.map(s => {
            const profile = s.perProfileResponseTime[name];
            if (profile && profile.count > 0) return profile.sum / profile.count;
            return null;
          })
        );
        return [timeSeconds, ...series];
      }
    }
  }

  getProfileNames(): string[] {
    return this.profileNames;
  }
}
