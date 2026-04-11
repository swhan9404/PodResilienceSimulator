function formatRecoveryTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function StatCard({ label, value, subtitle, accentColor }: {
  label: string; value: string; subtitle: string; accentColor: string;
}) {
  return (
    <div
      className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)] text-center"
      style={{ borderTopWidth: '3px', borderTopColor: accentColor }}
      aria-label={`${label}: ${value}`}
    >
      <div className="text-xs font-semibold text-[var(--text-secondary)]">{label}</div>
      <div className="text-[28px] font-semibold text-[var(--text-primary)] mt-1">{value}</div>
      <div className="text-xs text-[var(--text-secondary)] mt-1">{subtitle}</div>
    </div>
  );
}

interface SummaryCardsProps {
  recoveryTimeMs: number;
  rate503Percent: number;
  total503s: number;
  totalRequests: number;
  droppedByRestart: number;
}

export function SummaryCards({ recoveryTimeMs, rate503Percent, total503s, totalRequests, droppedByRestart }: SummaryCardsProps) {
  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">Summary</h3>
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Recovery Time"
          value={formatRecoveryTime(recoveryTimeMs)}
          subtitle="from stop to full ready"
          accentColor="#22C55E"
        />
        <StatCard
          label="503 Error Rate"
          value={`${rate503Percent.toFixed(1)}%`}
          subtitle={`${new Intl.NumberFormat().format(total503s)} of ${new Intl.NumberFormat().format(totalRequests)} requests`}
          accentColor="#EF4444"
        />
        <StatCard
          label="Total Requests"
          value={new Intl.NumberFormat().format(totalRequests)}
          subtitle={`${new Intl.NumberFormat().format(droppedByRestart)} dropped by restart`}
          accentColor="#3B82F6"
        />
      </div>
    </div>
  );
}
