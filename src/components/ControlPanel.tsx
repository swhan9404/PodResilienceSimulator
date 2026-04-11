import { StatusDisplay } from './StatusDisplay';
import { PlaybackControls } from './PlaybackControls';
import { SpeedControl } from './SpeedControl';
import { ClusterParams } from './ClusterParams';
import { TrafficParams } from './TrafficParams';
import { RequestProfileList } from './RequestProfileList';
import { ProbeParams } from './ProbeParams';
import { PodParams } from './PodParams';

export function ControlPanel() {
  return (
    <div className="w-[300px] shrink-0 h-screen overflow-y-auto bg-[var(--bg-secondary)] border-r border-[var(--border-color)] p-6 flex flex-col gap-8">
      <StatusDisplay />
      <div className="flex flex-col gap-4">
        <PlaybackControls />
        <SpeedControl />
      </div>
      <ClusterParams />
      <TrafficParams />
      <RequestProfileList />
      <ProbeParams type="liveness" />
      <ProbeParams type="readiness" />
      <PodParams />
    </div>
  );
}
