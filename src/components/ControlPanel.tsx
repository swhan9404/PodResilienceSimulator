import { ClusterParams } from './ClusterParams';
import { TrafficParams } from './TrafficParams';
import { ProbeParams } from './ProbeParams';
import { PodParams } from './PodParams';

export function ControlPanel() {
  return (
    <div className="w-[300px] shrink-0 h-screen overflow-y-auto bg-[var(--bg-secondary)] border-r border-[var(--border-color)] p-6 flex flex-col gap-8">
      {/* StatusDisplay - Plan 02 */}
      <div />
      {/* PlaybackControls - Plan 02 */}
      <div />
      <ClusterParams />
      <TrafficParams />
      {/* RequestProfileList - Plan 02 */}
      <ProbeParams type="liveness" />
      <ProbeParams type="readiness" />
      <PodParams />
    </div>
  );
}
