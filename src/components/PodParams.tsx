import { useSimulationStore } from '../store/useSimulationStore';
import { NumberInput } from './NumberInput';
import { ParamSection } from './ParamSection';

export function PodParams() {
  const config = useSimulationStore((s) => s.config);
  const updateConfig = useSimulationStore((s) => s.updateConfig);
  const disabled = useSimulationStore((s) => s.playback) !== 'idle';

  return (
    <ParamSection title="Pod">
      <NumberInput label="Init Time (ms)" value={config.initializeTimeMs} onChange={(v) => updateConfig({ initializeTimeMs: v })} min={0} step={1000} disabled={disabled} />
      <NumberInput label="Seed" value={config.seed} onChange={(v) => updateConfig({ seed: v })} min={0} step={1} disabled={disabled} />
    </ParamSection>
  );
}
