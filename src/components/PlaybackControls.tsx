import { useSimulationStore } from '../store/useSimulationStore';

const btnBase = 'h-9 px-4 rounded-md text-sm font-semibold cursor-pointer disabled:cursor-not-allowed';
const btnPrimary = `${btnBase} bg-[#3B82F6] text-white hover:bg-[#2563EB]`;
const btnWarning = `${btnBase} bg-[#F59E0B] text-white hover:bg-[#D97706]`;
const btnSecondary = `${btnBase} bg-[var(--bg-dominant)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--bg-secondary)]`;
const btnGhostDestructive = `${btnBase} bg-transparent text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)]`;

export function PlaybackControls() {
  const playback = useSimulationStore((s) => s.playback);
  const start = useSimulationStore((s) => s.start);
  const pause = useSimulationStore((s) => s.pause);
  const resume = useSimulationStore((s) => s.resume);
  const reset = useSimulationStore((s) => s.reset);
  const stopRequests = useSimulationStore((s) => s.stopRequests);

  return (
    <div className="flex gap-2 flex-wrap">
      {playback === 'idle' && (
        <button className={btnPrimary} onClick={start}>Start Simulation</button>
      )}
      {playback === 'running' && (
        <>
          <button className={btnSecondary} onClick={pause}>Pause</button>
          <button className={btnWarning} onClick={stopRequests}>Stop Requests</button>
          <button className={btnGhostDestructive} onClick={reset}>Reset</button>
        </>
      )}
      {playback === 'paused' && (
        <>
          <button className={btnPrimary} onClick={resume}>Resume</button>
          <button className={btnGhostDestructive} onClick={reset}>Reset</button>
        </>
      )}
      {playback === 'stopped_requests' && (
        <button className={btnGhostDestructive} onClick={reset}>Reset</button>
      )}
    </div>
  );
}
