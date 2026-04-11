import 'uplot/dist/uPlot.min.css';
import { useRef, useEffect, useCallback, useMemo } from 'react';
import UplotReact from 'uplot-react';
import type uPlot from 'uplot';
import { COLORS } from './colors';
import type { AlignedData } from './MetricsChartManager';

interface MetricsChartsProps {
  workerUsageData: AlignedData;
  readyPodsData: AlignedData;
  rate503Data: AlignedData;
  responseTimeData: AlignedData;
  profileNames: string[];
  profileColors: string[];
}

const CHART_HEIGHT = 200;

function makeWorkerUsageOpts(width: number): uPlot.Options {
  return {
    width,
    height: CHART_HEIGHT,
    title: 'Worker Usage %',
    series: [
      {},
      {
        label: 'Usage',
        stroke: COLORS.chartWorkerUsage,
        width: 2,
        fill: 'rgba(59, 130, 246, 0.1)',
      },
    ],
    axes: [
      { values: (_u: uPlot, vals: number[]) => vals.map(v => `${Math.round(v)}s`) },
      { values: (_u: uPlot, vals: number[]) => vals.map(v => `${Math.round(v)}%`) },
    ],
    scales: { y: { min: 0, max: 100 } },
  };
}

function makeReadyPodsOpts(width: number): uPlot.Options {
  return {
    width,
    height: CHART_HEIGHT,
    title: 'Ready Pods',
    series: [
      {},
      {
        label: 'Ready',
        stroke: COLORS.chartReadyPods,
        width: 2,
        fill: 'rgba(34, 197, 94, 0.1)',
      },
    ],
    axes: [
      { values: (_u: uPlot, vals: number[]) => vals.map(v => `${Math.round(v)}s`) },
      {},
    ],
    scales: { y: { min: 0 } },
  };
}

function makeRate503Opts(width: number): uPlot.Options {
  return {
    width,
    height: CHART_HEIGHT,
    title: '503 Rate %',
    series: [
      {},
      {
        label: '503 Rate',
        stroke: COLORS.chart503Rate,
        width: 2,
        fill: 'rgba(239, 68, 68, 0.1)',
      },
    ],
    axes: [
      { values: (_u: uPlot, vals: number[]) => vals.map(v => `${Math.round(v)}s`) },
      { values: (_u: uPlot, vals: number[]) => vals.map(v => `${Math.round(v)}%`) },
    ],
    scales: { y: { min: 0, max: 100 } },
  };
}

function makeResponseTimeOpts(width: number, profileNames: string[], profileColors: string[]): uPlot.Options {
  return {
    width,
    height: CHART_HEIGHT,
    title: 'Response Time (ms)',
    series: [
      {},
      ...profileNames.map((name, i) => ({
        label: name,
        stroke: profileColors[i],
        width: 2,
      })),
    ],
    axes: [
      { values: (_u: uPlot, vals: number[]) => vals.map(v => `${Math.round(v)}s`) },
      { values: (_u: uPlot, vals: number[]) => vals.map(v => `${Math.round(v)}ms`) },
    ],
    scales: { y: { min: 0 } },
  };
}

const EMPTY_DATA: uPlot.AlignedData = [[], []];

export function MetricsCharts({
  workerUsageData,
  readyPodsData,
  rate503Data,
  responseTimeData,
  profileNames,
  profileColors,
}: MetricsChartsProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<uPlot[]>([]);
  const chartWidthRef = useRef(400);

  const storeChart = useCallback((index: number) => (chart: uPlot) => {
    chartsRef.current[index] = chart;
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const gridWidth = entry.contentRect.width;
        // 2 columns with 16px gap -> each chart gets (gridWidth - 16) / 2
        const chartWidth = Math.floor((gridWidth - 16) / 2);
        if (chartWidth > 0 && chartWidth !== chartWidthRef.current) {
          chartWidthRef.current = chartWidth;
          for (const chart of chartsRef.current) {
            if (chart) {
              chart.setSize({ width: chartWidth, height: CHART_HEIGHT });
            }
          }
        }
      }
    });

    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const workerUsageOpts = useMemo(
    () => makeWorkerUsageOpts(chartWidthRef.current),
    [],
  );
  const readyPodsOpts = useMemo(
    () => makeReadyPodsOpts(chartWidthRef.current),
    [],
  );
  const rate503Opts = useMemo(
    () => makeRate503Opts(chartWidthRef.current),
    [],
  );
  const responseTimeOpts = useMemo(
    () => makeResponseTimeOpts(chartWidthRef.current, profileNames, profileColors),
    [profileNames, profileColors],
  );

  const safeWorkerUsage = workerUsageData[0].length > 0 ? workerUsageData : EMPTY_DATA;
  const safeReadyPods = readyPodsData[0].length > 0 ? readyPodsData : EMPTY_DATA;
  const safeRate503 = rate503Data[0].length > 0 ? rate503Data : EMPTY_DATA;
  const safeResponseTime = responseTimeData[0].length > 0 ? responseTimeData : EMPTY_DATA;

  return (
    <div ref={gridRef} className="grid grid-cols-2 gap-4">
      <div>
        <UplotReact
          options={workerUsageOpts}
          data={safeWorkerUsage as uPlot.AlignedData}
          resetScales={true}
          onCreate={storeChart(0)}
        />
      </div>
      <div>
        <UplotReact
          options={readyPodsOpts}
          data={safeReadyPods as uPlot.AlignedData}
          resetScales={true}
          onCreate={storeChart(1)}
        />
      </div>
      <div>
        <UplotReact
          options={rate503Opts}
          data={safeRate503 as uPlot.AlignedData}
          resetScales={true}
          onCreate={storeChart(2)}
        />
      </div>
      <div>
        <UplotReact
          options={responseTimeOpts}
          data={safeResponseTime as uPlot.AlignedData}
          resetScales={true}
          onCreate={storeChart(3)}
        />
      </div>
    </div>
  );
}
