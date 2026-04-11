import { useSimulationStore } from '../store/useSimulationStore';
import { DegradationTimeline } from './DegradationTimeline';
import { SummaryCards } from './SummaryCards';
import { ProfileTable } from './ProfileTable';

export function SimulationReport() {
  const reportData = useSimulationStore((s) => s.reportData);
  const config = useSimulationStore((s) => s.config);

  if (!reportData) return null;

  // Build profile color map from config
  const profileColors: Record<string, string> = {};
  for (const p of config.requestProfiles) {
    profileColors[p.name] = p.color;
  }

  return (
    <div className="flex-1 p-8 flex flex-col gap-6 overflow-auto" role="region" aria-label="Simulation Report">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">Simulation Report</h2>

      <DegradationTimeline
        criticalEvents={reportData.criticalEvents}
        simulationDurationMs={reportData.simulationDurationMs}
        rps={config.rps}
        profileCount={config.requestProfiles.length}
      />

      <SummaryCards
        recoveryTimeMs={reportData.recoveryTimeMs}
        rate503Percent={reportData.rate503Percent}
        total503s={reportData.total503s}
        totalRequests={reportData.totalRequests}
        droppedByRestart={reportData.droppedByRestart}
      />

      <ProfileTable
        profiles={reportData.perProfileAvgResponseTime}
        profileColors={profileColors}
      />
    </div>
  );
}
