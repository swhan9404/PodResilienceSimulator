import { SimulationEngine } from '../simulation/engine';
import { PodRenderer } from './PodRenderer';
import { MetricsChartManager } from './MetricsChartManager';
import type { AlignedData } from './MetricsChartManager';

export interface LoopCallbacks {
  onChartUpdate: (data: {
    workerUsage: AlignedData;
    readyPods: AlignedData;
    rate503: AlignedData;
    responseTime: AlignedData;
  }) => void;
}

export class SimulationLoop {
  private engine: SimulationEngine;
  private podRenderer: PodRenderer | null = null;
  private chartManager: MetricsChartManager;
  private callbacks: LoopCallbacks;
  private speed: number = 1;
  private lastTimestamp: number = 0;
  private rafHandle: number = 0;
  private running: boolean = false;
  private lastChartClockMs: number = 0;
  private chartThrottleMs: number = 1000; // 1Hz per D-10
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private isDark: boolean = false;

  constructor(
    engine: SimulationEngine,
    chartManager: MetricsChartManager,
    callbacks: LoopCallbacks,
  ) {
    this.engine = engine;
    this.chartManager = chartManager;
    this.callbacks = callbacks;
  }

  setPodRenderer(renderer: PodRenderer | null): void {
    this.podRenderer = renderer;
  }

  setCanvasDimensions(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  setDarkMode(isDark: boolean): void {
    this.isDark = isDark;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
  }

  // Exposed for testing
  tick = (timestamp: number): void => {
    if (!this.running) return;

    const wallDelta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Clamp to 100ms to prevent spiral of death after tab switch (Pitfall 5)
    const clampedDelta = Math.min(wallDelta, 100);
    const simDelta = clampedDelta * this.speed;

    // Advance simulation
    this.engine.step(simDelta);
    const snapshot = this.engine.getSnapshot();

    // Canvas: every frame (D-10)
    if (this.podRenderer && this.canvasWidth > 0) {
      this.podRenderer.draw(snapshot.pods, this.canvasWidth, this.canvasHeight, this.isDark);
    }

    // Charts: throttled to 1Hz based on simulation clock (D-10)
    if (snapshot.clock - this.lastChartClockMs >= this.chartThrottleMs) {
      this.lastChartClockMs = snapshot.clock;
      this.callbacks.onChartUpdate({
        workerUsage: this.chartManager.getChartData('workerUsage', snapshot.metrics, snapshot.clock),
        readyPods: this.chartManager.getChartData('readyPods', snapshot.metrics, snapshot.clock),
        rate503: this.chartManager.getChartData('rate503', snapshot.metrics, snapshot.clock),
        responseTime: this.chartManager.getChartData('responseTime', snapshot.metrics, snapshot.clock),
      });
    }

    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
