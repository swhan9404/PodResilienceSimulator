export interface PodLayout {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  offsetX: number;  // centering offset
  offsetY: number;
}

export interface CanvasTheme {
  isDark: boolean;
}
