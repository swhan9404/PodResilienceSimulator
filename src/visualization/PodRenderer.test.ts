import { describe, it, expect } from 'vitest';
import { calculateLayout } from './PodRenderer';
import { COLORS } from './colors';

describe('calculateLayout', () => {
  const canvasWidth = 1280;
  const canvasHeight = 400;
  const workersPerPod = 4;

  it('returns cols=1 for 1 pod', () => {
    const layout = calculateLayout(1, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(1);
  });

  it('returns cols=3 for 3 pods', () => {
    const layout = calculateLayout(3, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(3);
  });

  it('returns cols=2 for 4 pods', () => {
    const layout = calculateLayout(4, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(2);
  });

  it('returns cols=3 for 5 pods', () => {
    const layout = calculateLayout(5, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(3);
  });

  it('returns cols=3 for 9 pods', () => {
    const layout = calculateLayout(9, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(3);
  });

  it('returns cols=4 for 12 pods', () => {
    const layout = calculateLayout(12, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(4);
  });

  it('returns cols=4 for 16 pods', () => {
    const layout = calculateLayout(16, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(4);
  });

  it('returns cols=5 for 20 pods', () => {
    const layout = calculateLayout(20, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(5);
  });

  it('returns positive cell dimensions that fit within canvas', () => {
    const layout = calculateLayout(5, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cellWidth).toBeGreaterThan(0);
    expect(layout.cellHeight).toBeGreaterThan(0);
    const totalWidth = layout.cols * layout.cellWidth + (layout.cols - 1) * layout.gap + layout.offsetX * 2;
    expect(totalWidth).toBeLessThanOrEqual(canvasWidth);
    const totalHeight = layout.rows * layout.cellHeight + (layout.rows - 1) * layout.gap + layout.offsetY * 2;
    expect(totalHeight).toBeLessThanOrEqual(canvasHeight);
  });

  it('computes correct rows', () => {
    const layout = calculateLayout(7, workersPerPod, canvasWidth, canvasHeight);
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(3); // ceil(7/3)
  });
});

describe('COLORS', () => {
  it('has correct podReady color', () => {
    expect(COLORS.podReady).toBe('#22C55E');
  });

  it('has correct podNotReady color', () => {
    expect(COLORS.podNotReady).toBe('#F59E0B');
  });

  it('has correct podRestarting color', () => {
    expect(COLORS.podRestarting).toBe('#EF4444');
  });
});
