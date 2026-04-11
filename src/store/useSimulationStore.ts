import { create } from 'zustand';
import { SimulationEngine } from '../simulation/engine';
import { SimulationLoop } from '../visualization/SimulationLoop';
import { MetricsChartManager } from '../visualization/MetricsChartManager';
import type { AlignedData } from '../visualization/MetricsChartManager';
import type { SimulationConfig, ProbeConfig, RequestProfile } from '../simulation/types';
import type { PodRenderer } from '../visualization/PodRenderer';

// --- Types ---

type PlaybackState = 'idle' | 'running' | 'paused' | 'stopped_requests';

interface ChartData {
  workerUsage: AlignedData;
  readyPods: AlignedData;
  rate503: AlignedData;
  responseTime: AlignedData;
}

interface SimulationStore {
  // Config state (PAR-01 through PAR-06)
  config: SimulationConfig;
  updateConfig: (partial: Partial<SimulationConfig>) => void;
  updateLivenessProbe: (partial: Partial<ProbeConfig>) => void;
  updateReadinessProbe: (partial: Partial<ProbeConfig>) => void;
  setRequestProfiles: (profiles: RequestProfile[]) => void;

  // Playback state
  playback: PlaybackState;
  speed: number;

  // Throttled status for CTL-04
  statusClock: number;
  status503: number;
  statusReadyPods: number;

  // Chart data (updated from loop callback)
  chartData: ChartData;

  // Engine refs (not serializable, per D-10)
  engineRef: SimulationEngine | null;
  loopRef: SimulationLoop | null;

  // Renderer connection (absorb from useSimulation)
  rendererRef: { current: PodRenderer | null };
  canvasDimsRef: { current: { width: number; height: number } };

  // Actions
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  stopRequests: () => void;
  setSpeed: (speed: number) => void;
  onRendererReady: (renderer: PodRenderer | null) => void;
  onCanvasResize: (width: number, height: number) => void;
}

// --- Helpers ---

export function normalizeRatios(profiles: RequestProfile[]): RequestProfile[] {
  const total = profiles.reduce((sum, p) => sum + p.ratio, 0);
  if (total === 0) return profiles;
  return profiles.map(p => ({ ...p, ratio: p.ratio / total }));
}

const EMPTY_DATA: AlignedData = [[], []];

export const EMPTY_CHART_DATA: ChartData = {
  workerUsage: EMPTY_DATA,
  readyPods: EMPTY_DATA,
  rate503: EMPTY_DATA,
  responseTime: EMPTY_DATA,
};

// --- Default config with pre-normalization ratios (D-03) ---

const DEFAULT_CONFIG: SimulationConfig = {
  podCount: 5,
  workersPerPod: 4,
  maxBacklogPerPod: 10,
  rps: 50,
  requestProfiles: [
    { name: 'normal', latencyMs: 200, ratio: 7, color: '#3B82F6' },
    { name: 'slow', latencyMs: 5000, ratio: 3, color: '#F97316' },
  ],
  livenessProbe: { periodSeconds: 10, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
  readinessProbe: { periodSeconds: 5, timeoutSeconds: 1, failureThreshold: 3, successThreshold: 1 },
  initializeTimeMs: 30000,
  seed: 42,
};

// --- Dark mode listener cleanup ref ---
let darkModeCleanup: (() => void) | null = null;

// --- Store ---

export const useSimulationStore = create<SimulationStore>()((set, get) => ({
  // Config
  config: DEFAULT_CONFIG,
  updateConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
  updateLivenessProbe: (partial) => set((s) => ({
    config: { ...s.config, livenessProbe: { ...s.config.livenessProbe, ...partial } },
  })),
  updateReadinessProbe: (partial) => set((s) => ({
    config: { ...s.config, readinessProbe: { ...s.config.readinessProbe, ...partial } },
  })),
  setRequestProfiles: (profiles) => set((s) => ({
    config: { ...s.config, requestProfiles: profiles },
  })),

  // Playback
  playback: 'idle',
  speed: 1,

  // Status
  statusClock: 0,
  status503: 0,
  statusReadyPods: 0,

  // Chart data
  chartData: EMPTY_CHART_DATA,

  // Engine refs
  engineRef: null,
  loopRef: null,

  // Renderer refs
  rendererRef: { current: null },
  canvasDimsRef: { current: { width: 0, height: 0 } },

  // Actions
  start: () => {
    const { config } = get();

    // Normalize ratios (D-03)
    const normalizedConfig: SimulationConfig = {
      ...config,
      requestProfiles: normalizeRatios(config.requestProfiles),
    };

    // Create engine
    const engine = new SimulationEngine(normalizedConfig);

    // Create chart manager
    const chartManager = new MetricsChartManager(
      normalizedConfig.requestProfiles.map(p => p.name),
    );

    // Create loop with callbacks
    const loop = new SimulationLoop(engine, chartManager, {
      onChartUpdate: (data) => {
        // Update chart data
        set({ chartData: data });

        // Piggyback throttled status update on chart callback (~1Hz)
        const snapshot = engine.getSnapshot();
        set({
          statusClock: snapshot.clock,
          status503: snapshot.stats.total503s,
          statusReadyPods: snapshot.stats.readyPodCount,
        });
      },
    });

    // Connect renderer if already available
    const { rendererRef, canvasDimsRef } = get();
    if (rendererRef.current) {
      loop.setPodRenderer(rendererRef.current);
    }
    if (canvasDimsRef.current.width > 0) {
      loop.setCanvasDimensions(canvasDimsRef.current.width, canvasDimsRef.current.height);
    }

    // Detect dark mode
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    loop.setDarkMode(darkQuery.matches);
    const onDarkChange = (e: MediaQueryListEvent) => loop.setDarkMode(e.matches);
    darkQuery.addEventListener('change', onDarkChange);
    darkModeCleanup = () => darkQuery.removeEventListener('change', onDarkChange);

    // Store refs and start
    set({ engineRef: engine, loopRef: loop, playback: 'running' });
    loop.start();
  },

  pause: () => {
    get().loopRef?.stop();
    set({ playback: 'paused' });
  },

  resume: () => {
    get().loopRef?.start();
    set({ playback: 'running' });
  },

  reset: () => {
    // Stop loop BEFORE clearing refs (Pitfall 2)
    get().loopRef?.stop();

    // Clean up dark mode listener
    if (darkModeCleanup) {
      darkModeCleanup();
      darkModeCleanup = null;
    }

    set({
      engineRef: null,
      loopRef: null,
      playback: 'idle',
      speed: 1,
      statusClock: 0,
      status503: 0,
      statusReadyPods: 0,
      chartData: EMPTY_CHART_DATA,
    });
  },

  stopRequests: () => {
    get().engineRef?.stopRequests();
    set({ playback: 'stopped_requests' });
  },

  setSpeed: (speed) => {
    get().loopRef?.setSpeed(speed);
    set({ speed });
  },

  onRendererReady: (renderer) => {
    get().rendererRef.current = renderer;
    get().loopRef?.setPodRenderer(renderer);
  },

  onCanvasResize: (width, height) => {
    get().canvasDimsRef.current = { width, height };
    get().loopRef?.setCanvasDimensions(width, height);
  },
}));
