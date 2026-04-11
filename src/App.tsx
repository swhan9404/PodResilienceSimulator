import { useSimulationStore } from './store/useSimulationStore';
import { ControlPanel } from './components/ControlPanel';
import { SimulationReport } from './components/SimulationReport';
import { PodCanvas } from './visualization/PodCanvas';
import { MetricsCharts } from './visualization/MetricsCharts';

function App() {
  const chartData = useSimulationStore((s) => s.chartData);
  const rendererRef = useSimulationStore((s) => s.rendererRef);
  const onRendererReady = useSimulationStore((s) => s.onRendererReady);
  const onCanvasResize = useSimulationStore((s) => s.onCanvasResize);
  const config = useSimulationStore((s) => s.config);
  const playback = useSimulationStore((s) => s.playback);
  const reportData = useSimulationStore((s) => s.reportData);

  const profileNames = config.requestProfiles.map(p => p.name);
  const profileColors = config.requestProfiles.map(p => p.color);

  return (
    <div className="min-w-[1280px] min-h-screen bg-[var(--bg-dominant)] flex">
      <ControlPanel />
      {playback === 'recovered' && reportData ? (
        <SimulationReport />
      ) : (
        <div className="flex-1 p-8 flex flex-col gap-6 overflow-auto">
          <section className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
            <PodCanvas
              rendererRef={rendererRef}
              onRendererReady={onRendererReady}
              onCanvasResize={onCanvasResize}
            />
          </section>
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
      )}
    </div>
  );
}

export default App;
