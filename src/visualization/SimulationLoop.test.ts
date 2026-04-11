import { describe, it, expect, vi } from 'vitest';
import { SimulationLoop } from './SimulationLoop';
import type { LoopCallbacks } from './SimulationLoop';
import type { AlignedData } from './MetricsChartManager';

function createMockEngine(clock = 0) {
  return {
    step: vi.fn(),
    getSnapshot: vi.fn(() => ({
      clock,
      pods: [],
      stats: {
        totalRequests: 0,
        total503s: 0,
        droppedByRestart: 0,
        readyPodCount: 0,
        activeWorkerCount: 0,
        totalWorkerCount: 0,
      },
      metrics: [],
      phase: 'running' as const,
    })),
  };
}

function createMockChartManager() {
  const emptyData: AlignedData = [[], []];
  return {
    getChartData: vi.fn(() => emptyData),
    getProfileNames: vi.fn(() => []),
  };
}

function createMockPodRenderer() {
  return {
    draw: vi.fn(),
  };
}

function createMockCallbacks(): LoopCallbacks {
  return {
    onChartUpdate: vi.fn(),
  };
}

describe('SimulationLoop', () => {
  it('tick() calls engine.step() with (wallDelta * speed) ms', () => {
    const engine = createMockEngine(0);
    const chartManager = createMockChartManager();
    const callbacks = createMockCallbacks();

    const loop = new SimulationLoop(
      engine as any,
      chartManager as any,
      callbacks,
    );
    loop.setSpeed(2);

    // Simulate: lastTimestamp = 1000, tick called at 1050 -> wallDelta = 50
    // simDelta = 50 * 2 = 100
    (loop as any).lastTimestamp = 1000;
    (loop as any).running = true;
    loop.tick(1050);

    expect(engine.step).toHaveBeenCalledWith(100);
  });

  it('tick() clamps wallDelta to 100ms max (spiral of death prevention)', () => {
    const engine = createMockEngine(0);
    const chartManager = createMockChartManager();
    const callbacks = createMockCallbacks();

    const loop = new SimulationLoop(
      engine as any,
      chartManager as any,
      callbacks,
    );
    loop.setSpeed(1);

    // lastTimestamp = 0, tick called at 500 -> wallDelta = 500
    // Clamped to 100, simDelta = 100 * 1 = 100 (not 500)
    (loop as any).lastTimestamp = 0;
    (loop as any).running = true;
    loop.tick(500);

    expect(engine.step).toHaveBeenCalledWith(100);
  });

  it('tick() calls podRenderer.draw() on every tick', () => {
    const engine = createMockEngine(0);
    const chartManager = createMockChartManager();
    const callbacks = createMockCallbacks();
    const renderer = createMockPodRenderer();

    const loop = new SimulationLoop(
      engine as any,
      chartManager as any,
      callbacks,
    );
    loop.setPodRenderer(renderer as any);
    loop.setCanvasDimensions(800, 300);

    (loop as any).lastTimestamp = 0;
    (loop as any).running = true;
    loop.tick(16);

    expect(renderer.draw).toHaveBeenCalledWith([], 800, 300, false);
  });

  it('tick() calls onChartUpdate when snapshot.clock advances >= 1000ms', () => {
    // Return clock = 1500 so it's >= 1000 from lastChartClockMs (0)
    const engine = createMockEngine(1500);
    const chartManager = createMockChartManager();
    const callbacks = createMockCallbacks();

    const loop = new SimulationLoop(
      engine as any,
      chartManager as any,
      callbacks,
    );

    (loop as any).lastTimestamp = 0;
    (loop as any).running = true;
    (loop as any).lastChartClockMs = 0;
    loop.tick(16);

    expect(callbacks.onChartUpdate).toHaveBeenCalled();
    expect(chartManager.getChartData).toHaveBeenCalledTimes(4);
  });

  it('tick() does NOT call onChartUpdate when clock has not advanced enough', () => {
    // Return clock = 500 so it's < 1000 from lastChartClockMs (0)
    const engine = createMockEngine(500);
    const chartManager = createMockChartManager();
    const callbacks = createMockCallbacks();

    const loop = new SimulationLoop(
      engine as any,
      chartManager as any,
      callbacks,
    );

    (loop as any).lastTimestamp = 0;
    (loop as any).running = true;
    (loop as any).lastChartClockMs = 0;
    loop.tick(16);

    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
  });
});
