export const COLORS = {
  // Pod state borders (D-04, VIZ-04)
  podReady: '#22C55E',
  podNotReady: '#F59E0B',
  podRestarting: '#EF4444',

  // Worker cells (D-02, VIZ-02)
  workerIdle: { light: '#E5E7EB', dark: '#374151' },

  // Probe indicators (D-05, VIZ-03)
  probeSuccess: { light: '#22C55E', dark: '#4ADE80' },
  probeFailure: { light: '#EF4444', dark: '#F87171' },

  // Canvas backgrounds
  canvasBg: { light: '#F8F9FA', dark: '#1A1B23' },
  podCardBg: { light: '#FFFFFF', dark: '#1F2028' },

  // Text
  textLabel: { light: '#1F2937', dark: '#E5E7EB' },

  // Chart series colors
  chartWorkerUsage: '#3B82F6',
  chartReadyPods: '#22C55E',
  chart503Rate: '#EF4444',

  // Chart grid/axis
  chartGrid: { light: 'rgba(229,231,235,0.5)', dark: 'rgba(55,65,81,0.5)' },
  chartAxisLabel: { light: '#6B7280', dark: '#9CA3AF' },
} as const;

export interface ThemeColors {
  workerIdle: string;
  probeSuccess: string;
  probeFailure: string;
  canvasBg: string;
  podCardBg: string;
  textLabel: string;
  chartGrid: string;
  chartAxisLabel: string;
}

export function getThemeColors(isDark: boolean): ThemeColors {
  const mode = isDark ? 'dark' : 'light';
  return {
    workerIdle: COLORS.workerIdle[mode],
    probeSuccess: COLORS.probeSuccess[mode],
    probeFailure: COLORS.probeFailure[mode],
    canvasBg: COLORS.canvasBg[mode],
    podCardBg: COLORS.podCardBg[mode],
    textLabel: COLORS.textLabel[mode],
    chartGrid: COLORS.chartGrid[mode],
    chartAxisLabel: COLORS.chartAxisLabel[mode],
  };
}
