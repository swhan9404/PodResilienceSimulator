import { useRef, useEffect, useState, useCallback } from 'react';
import { SimulationEngine } from '../simulation/engine';
import { SimulationLoop } from './SimulationLoop';
import { MetricsChartManager } from './MetricsChartManager';
import { PodRenderer } from './PodRenderer';
import type { SimulationConfig } from '../simulation/types';
import type { AlignedData } from './MetricsChartManager';

interface ChartData {
  workerUsage: AlignedData;
  readyPods: AlignedData;
  rate503: AlignedData;
  responseTime: AlignedData;
}

const EMPTY_DATA: AlignedData = [[], []];

export function useSimulation(config: SimulationConfig) {
  const loopRef = useRef<SimulationLoop | null>(null);
  const rendererRef = useRef<PodRenderer | null>(null);
  const canvasDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [chartData, setChartData] = useState<ChartData>({
    workerUsage: EMPTY_DATA,
    readyPods: EMPTY_DATA,
    rate503: EMPTY_DATA,
    responseTime: EMPTY_DATA,
  });

  useEffect(() => {
    const engine = new SimulationEngine(config);

    const profileNames = config.requestProfiles.map(p => p.name);
    const chartManager = new MetricsChartManager(profileNames);

    const loop = new SimulationLoop(engine, chartManager, {
      onChartUpdate: (data) => setChartData(data),
    });
    loopRef.current = loop;

    // Child effects (PodCanvas) run before parent effects — renderer may already exist
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

    // Auto-start per D-11
    loop.start();

    return () => {
      loop.stop();
      darkQuery.removeEventListener('change', onDarkChange);
      loopRef.current = null;
    };
  }, []); // config is stable (DEMO_CONFIG constant)

  // Connect PodRenderer when PodCanvas mounts
  const onRendererReady = useCallback((renderer: PodRenderer | null) => {
    rendererRef.current = renderer;
    if (loopRef.current) {
      loopRef.current.setPodRenderer(renderer);
    }
  }, []);

  // Update canvas dimensions (called by PodCanvas on resize)
  const onCanvasResize = useCallback((width: number, height: number) => {
    canvasDimsRef.current = { width, height };
    if (loopRef.current) {
      loopRef.current.setCanvasDimensions(width, height);
    }
  }, []);

  return {
    chartData,
    rendererRef,
    onRendererReady,
    onCanvasResize,
    profileNames: config.requestProfiles.map(p => p.name),
    profileColors: config.requestProfiles.map(p => p.color),
  };
}
