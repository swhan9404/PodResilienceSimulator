import { PodState } from '../simulation/types';
import type { PodSnapshot } from '../simulation/types';
import { COLORS, getThemeColors } from './colors';
import type { PodLayout } from './types';

// Pod card spacing constants (from UI-SPEC)
const POD_GAP = 16;          // md token
const POD_PADDING = 8;       // sm token
const WORKER_CELL_SIZE = 20; // 20x20px
const WORKER_CELL_GAP = 4;   // xs token
const POD_LABEL_HEIGHT = 16;
const BACKLOG_LABEL_HEIGHT = 12;
const PROBE_ROW_HEIGHT = 12;
const BORDER_WIDTH = 3;
const BORDER_RADIUS = 4;

/**
 * Calculate grid column count per UI-SPEC table:
 *  1-3 pods: cols = podCount
 *  4 pods: cols = 2
 *  5-9 pods: cols = 3
 *  10-16 pods: cols = 4
 *  17-20 pods: cols = 5
 */
function getColumnCount(podCount: number): number {
  if (podCount <= 3) return podCount;
  if (podCount <= 4) return 2;
  if (podCount <= 9) return 3;
  if (podCount <= 16) return 4;
  return 5;
}

/**
 * Calculate pod card dimensions based on worker count.
 * Internal layout: padding + label + worker grid + backlog + 2 probe rows + padding
 */
function calculatePodCardSize(workersPerPod: number): { width: number; height: number } {
  const workerCols = Math.ceil(Math.sqrt(workersPerPod));
  const workerRows = Math.ceil(workersPerPod / workerCols);

  const gridWidth = workerCols * WORKER_CELL_SIZE + (workerCols - 1) * WORKER_CELL_GAP;
  const gridHeight = workerRows * WORKER_CELL_SIZE + (workerRows - 1) * WORKER_CELL_GAP;

  const contentWidth = Math.max(gridWidth, 80); // minimum width for text
  const contentHeight = POD_LABEL_HEIGHT + gridHeight + BACKLOG_LABEL_HEIGHT + PROBE_ROW_HEIGHT * 2;

  return {
    width: contentWidth + POD_PADDING * 2 + BORDER_WIDTH * 2,
    height: contentHeight + POD_PADDING * 2 + BORDER_WIDTH * 2,
  };
}

export function calculateLayout(
  podCount: number,
  workersPerPod: number,
  canvasWidth: number,
  canvasHeight: number,
): PodLayout {
  if (podCount === 0) {
    return { cols: 0, rows: 0, cellWidth: 0, cellHeight: 0, gap: POD_GAP, offsetX: 0, offsetY: 0 };
  }

  const cols = getColumnCount(podCount);
  const rows = Math.ceil(podCount / cols);
  const cardSize = calculatePodCardSize(workersPerPod);

  const totalGridWidth = cols * cardSize.width + (cols - 1) * POD_GAP;
  const totalGridHeight = rows * cardSize.height + (rows - 1) * POD_GAP;

  const offsetX = Math.max(0, Math.floor((canvasWidth - totalGridWidth) / 2));
  const offsetY = Math.max(0, Math.floor((canvasHeight - totalGridHeight) / 2));

  return {
    cols,
    rows,
    cellWidth: cardSize.width,
    cellHeight: cardSize.height,
    gap: POD_GAP,
    offsetX,
    offsetY,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export class PodRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  draw(pods: PodSnapshot[], canvasWidth: number, canvasHeight: number, isDark: boolean): void {
    const ctx = this.ctx;
    const theme = getThemeColors(isDark);

    // 1. Clear and fill background
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = theme.canvasBg;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (pods.length === 0) return;

    const workersPerPod = pods[0].workers.length;
    const layout = calculateLayout(pods.length, workersPerPod, canvasWidth, canvasHeight);

    // 3. Draw each pod
    for (let i = 0; i < pods.length; i++) {
      const col = i % layout.cols;
      const row = Math.floor(i / layout.cols);
      const x = layout.offsetX + col * (layout.cellWidth + layout.gap);
      const y = layout.offsetY + row * (layout.cellHeight + layout.gap);
      this.drawPod(pods[i], x, y, workersPerPod, theme);
    }
  }

  private drawPod(
    pod: PodSnapshot,
    x: number,
    y: number,
    workersPerPod: number,
    theme: ReturnType<typeof getThemeColors>,
  ): void {
    const ctx = this.ctx;
    const cardSize = calculatePodCardSize(workersPerPod);

    // Border color by state (D-04, VIZ-04)
    let borderColor: string;
    if (pod.state === PodState.READY) {
      borderColor = COLORS.podReady;
    } else if (pod.state === PodState.NOT_READY) {
      borderColor = COLORS.podNotReady;
    } else {
      borderColor = COLORS.podRestarting;
    }

    // 1. Pod card background + border
    const innerX = x + BORDER_WIDTH / 2;
    const innerY = y + BORDER_WIDTH / 2;
    const innerW = cardSize.width - BORDER_WIDTH;
    const innerH = cardSize.height - BORDER_WIDTH;

    roundRect(ctx, innerX, innerY, innerW, innerH, BORDER_RADIUS);
    ctx.fillStyle = theme.podCardBg;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = BORDER_WIDTH;
    ctx.stroke();

    // Content area starts after border + padding
    const contentX = x + BORDER_WIDTH + POD_PADDING;
    let contentY = y + BORDER_WIDTH + POD_PADDING;

    // 2. Pod label
    ctx.fillStyle = theme.textLabel;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`Pod ${pod.id}`, contentX, contentY);
    contentY += POD_LABEL_HEIGHT;

    // 3. Worker grid
    const workerCols = Math.ceil(Math.sqrt(workersPerPod));
    for (let i = 0; i < pod.workers.length; i++) {
      const worker = pod.workers[i];
      const wCol = i % workerCols;
      const wRow = Math.floor(i / workerCols);
      const wx = contentX + wCol * (WORKER_CELL_SIZE + WORKER_CELL_GAP);
      const wy = contentY + wRow * (WORKER_CELL_SIZE + WORKER_CELL_GAP);

      if (worker.busy) {
        ctx.fillStyle = worker.profileColor ?? '#888888';
      } else {
        ctx.fillStyle = theme.workerIdle;
      }
      ctx.fillRect(wx, wy, WORKER_CELL_SIZE, WORKER_CELL_SIZE);
    }

    const workerRows = Math.ceil(workersPerPod / workerCols);
    contentY += workerRows * WORKER_CELL_SIZE + (workerRows - 1) * WORKER_CELL_GAP;

    // 4. Backlog text
    ctx.fillStyle = theme.textLabel;
    ctx.font = '400 10px system-ui, sans-serif';
    ctx.fillText(`BL: ${pod.backlogSize}/${pod.backlogMax}`, contentX, contentY);
    contentY += BACKLOG_LABEL_HEIGHT;

    // 5. Probe rows
    this.drawProbeRow(ctx, 'L', pod.livenessHistory, contentX, contentY, theme);
    contentY += PROBE_ROW_HEIGHT;
    this.drawProbeRow(ctx, 'R', pod.readinessHistory, contentX, contentY, theme);
  }

  private drawProbeRow(
    ctx: CanvasRenderingContext2D,
    prefix: string,
    history: boolean[],
    x: number,
    y: number,
    theme: ReturnType<typeof getThemeColors>,
  ): void {
    ctx.font = '400 10px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.textLabel;
    ctx.fillText(`${prefix}: `, x, y);

    const prefixWidth = ctx.measureText(`${prefix}: `).width;
    let glyphX = x + prefixWidth;

    for (const result of history) {
      if (result) {
        ctx.fillStyle = theme.probeSuccess;
        ctx.fillText('+', glyphX, y);
      } else {
        ctx.fillStyle = theme.probeFailure;
        ctx.fillText('x', glyphX, y);
      }
      glyphX += ctx.measureText('+').width + 1;
    }
  }
}
