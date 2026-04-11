import type { CriticalEvents } from '../simulation/types';

function formatTimelineTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface TimelineEvent {
  label: string;
  detail: string;
  timestamp: string;
  colorClass: string;
  visible: boolean;
}

interface DegradationTimelineProps {
  criticalEvents: CriticalEvents;
  simulationDurationMs: number;
  rps: number;
  profileCount: number;
}

export function DegradationTimeline({ criticalEvents, rps, profileCount }: DegradationTimelineProps) {
  const events: TimelineEvent[] = [
    {
      label: 'Simulation Started',
      detail: `Traffic at ${rps} RPS with ${profileCount} profiles`,
      timestamp: '+00:00',
      colorClass: 'bg-[#3B82F6]',
      visible: true,
    },
    {
      label: 'First Readiness Failure',
      detail: `Pod ${criticalEvents.firstReadinessFailurePodId} removed from load balancer`,
      timestamp: criticalEvents.firstReadinessFailure !== null
        ? formatTimelineTime(criticalEvents.firstReadinessFailure)
        : '',
      colorClass: 'bg-[#F59E0B]',
      visible: criticalEvents.firstReadinessFailure !== null,
    },
    {
      label: 'First Pod Restart',
      detail: `Pod ${criticalEvents.firstLivenessRestartPodId} restarted by liveness probe`,
      timestamp: criticalEvents.firstLivenessRestart !== null
        ? formatTimelineTime(criticalEvents.firstLivenessRestart)
        : '',
      colorClass: 'bg-[#EF4444]',
      visible: criticalEvents.firstLivenessRestart !== null,
    },
    {
      label: 'Total Service Down',
      detail: 'All pods unavailable -- 100% 503 responses',
      timestamp: criticalEvents.allPodsDown !== null
        ? formatTimelineTime(criticalEvents.allPodsDown)
        : '',
      colorClass: 'bg-[#EF4444]',
      visible: criticalEvents.allPodsDown !== null,
    },
    {
      label: 'Requests Stopped',
      detail: 'Traffic stopped -- recovery in progress',
      timestamp: criticalEvents.stopRequestsTime !== null
        ? formatTimelineTime(criticalEvents.stopRequestsTime)
        : '',
      colorClass: 'bg-[#3B82F6]',
      visible: criticalEvents.stopRequestsTime !== null,
    },
    {
      label: 'Full Recovery',
      detail: 'All pods READY -- service restored',
      timestamp: criticalEvents.recoveredTime !== null
        ? formatTimelineTime(criticalEvents.recoveredTime)
        : '+??:??',
      colorClass: 'bg-[#22C55E]',
      visible: true,
    },
  ];

  const visibleEvents = events.filter(e => e.visible);

  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">Degradation Timeline</h3>
      <ol className="relative pl-8">
        <div className="absolute left-[11px] top-1.5 bottom-1.5 w-0.5 bg-[var(--border-color)]" aria-hidden="true" />
        {visibleEvents.map((event) => (
          <li key={event.label} className="relative mb-6 last:mb-0">
            <div className={`absolute left-[-26px] top-1 w-3 h-3 rounded-full ${event.colorClass}`} aria-hidden="true" />
            <div>
              <span className="text-sm font-semibold text-[var(--text-primary)]">{event.label}</span>
              <span className="text-sm text-[var(--text-secondary)] ml-2">{event.timestamp}</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)]">{event.detail}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
