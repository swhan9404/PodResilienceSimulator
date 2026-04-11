import { useSimulationStore } from '../store/useSimulationStore';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="text-xs font-semibold text-[var(--text-secondary)]">{label}</div>
      <div className="text-xl font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

export function StatusDisplay() {
  const playback = useSimulationStore((s) => s.playback);
  const clock = useSimulationStore((s) => s.statusClock);
  const count503 = useSimulationStore((s) => s.status503);
  const readyPods = useSimulationStore((s) => s.statusReadyPods);

  return (
    <div className="flex justify-between" aria-live="polite">
      <StatusItem label="Elapsed" value={playback === 'idle' ? '--' : formatElapsed(clock)} />
      <StatusItem label="503s" value={playback === 'idle' ? '--' : String(count503)} />
      <StatusItem label="Ready Pods" value={playback === 'idle' ? '--' : String(readyPods)} />
    </div>
  );
}
