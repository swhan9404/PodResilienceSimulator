import { useSimulationStore } from '../store/useSimulationStore';
import { NumberInput } from './NumberInput';
import { ParamSection } from './ParamSection';

interface ProbeParamsProps {
  type: 'liveness' | 'readiness';
}

export function ProbeParams({ type }: ProbeParamsProps) {
  const probe = useSimulationStore((s) =>
    type === 'liveness' ? s.config.livenessProbe : s.config.readinessProbe,
  );
  const updateProbe = useSimulationStore((s) =>
    type === 'liveness' ? s.updateLivenessProbe : s.updateReadinessProbe,
  );
  const disabled = useSimulationStore((s) => s.playback) !== 'idle';

  const title = type === 'liveness' ? 'Liveness Probe' : 'Readiness Probe';

  return (
    <ParamSection title={title}>
      <NumberInput label="Period (s)" value={probe.periodSeconds} onChange={(v) => updateProbe({ periodSeconds: v })} min={1} disabled={disabled} />
      <NumberInput label="Timeout (s)" value={probe.timeoutSeconds} onChange={(v) => updateProbe({ timeoutSeconds: v })} min={1} disabled={disabled} />
      <NumberInput label="Failure Threshold" value={probe.failureThreshold} onChange={(v) => updateProbe({ failureThreshold: v })} min={1} step={1} disabled={disabled} />
      <NumberInput label="Success Threshold" value={probe.successThreshold} onChange={(v) => updateProbe({ successThreshold: v })} min={1} step={1} disabled={disabled} />
    </ParamSection>
  );
}
