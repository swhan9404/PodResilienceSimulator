import { useSimulation } from './visualization/useSimulation';
import { PodCanvas } from './visualization/PodCanvas';
import { MetricsCharts } from './visualization/MetricsCharts';
import { DEMO_CONFIG } from './visualization/demoConfig';

function App() {
  const {
    chartData,
    rendererRef,
    onRendererReady,
    onCanvasResize,
    profileNames,
    profileColors,
  } = useSimulation(DEMO_CONFIG);

  return (
    <div className="min-w-[1280px] min-h-screen bg-[var(--bg-dominant)]">
      {/* Main content area - will become right panel when Phase 3 adds left sidebar */}
      <div className="p-8 flex flex-col gap-6">
        {/* Pod Canvas Grid (top section per D-12) */}
        <section className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
          <PodCanvas
            rendererRef={rendererRef}
            onRendererReady={onRendererReady}
            onCanvasResize={onCanvasResize}
          />
        </section>

        {/* Metrics Charts (bottom section per D-12) */}
        <section className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
          <MetricsCharts
            workerUsageData={chartData.workerUsage}
            readyPodsData={chartData.readyPods}
            rate503Data={chartData.rate503}
            responseTimeData={chartData.responseTime}
            profileNames={profileNames}
            profileColors={profileColors}
          />
        </section>
      </div>
    </div>
  );
}

export default App;
