import { useSimulationStore } from '../store/useSimulationStore';
import { NumberInput } from './NumberInput';
import { ParamSection } from './ParamSection';

export function TrafficParams() {
  const config = useSimulationStore((s) => s.config);
  const updateConfig = useSimulationStore((s) => s.updateConfig);
  const disabled = useSimulationStore((s) => s.playback) !== 'idle';

  return (
    <ParamSection title="Traffic">
      <NumberInput label="RPS" value={config.rps} onChange={(v) => updateConfig({ rps: v })} min={1} step={1} disabled={disabled} />
    </ParamSection>
  );
}
