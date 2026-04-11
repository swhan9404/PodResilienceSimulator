import { useSimulationStore } from '../store/useSimulationStore';
import { NumberInput } from './NumberInput';
import { ParamSection } from './ParamSection';

export function ClusterParams() {
  const config = useSimulationStore((s) => s.config);
  const updateConfig = useSimulationStore((s) => s.updateConfig);
  const disabled = useSimulationStore((s) => s.playback) !== 'idle';

  return (
    <ParamSection title="Cluster">
      <NumberInput label="Pod Count" value={config.podCount} onChange={(v) => updateConfig({ podCount: v })} min={1} step={1} disabled={disabled} />
      <NumberInput label="Workers / Pod" value={config.workersPerPod} onChange={(v) => updateConfig({ workersPerPod: v })} min={1} step={1} disabled={disabled} />
      <NumberInput label="Max Backlog / Pod" value={config.maxBacklogPerPod} onChange={(v) => updateConfig({ maxBacklogPerPod: v })} min={0} step={1} disabled={disabled} />
    </ParamSection>
  );
}
