interface ProfileTableProps {
  profiles: Array<{ profileName: string; avgResponseTimeMs: number; requestCount: number }>;
  profileColors: Record<string, string>;
}

export function ProfileTable({ profiles, profileColors }: ProfileTableProps) {
  return (
    <div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mt-6 mb-4">Response Time by Profile</h3>
      <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="px-4 py-2 w-4" aria-hidden="true"></th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-secondary)]" scope="col">Profile</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--text-secondary)] w-[120px]" scope="col">Avg Response</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--text-secondary)] w-[100px]" scope="col">Requests</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile, i) => (
              <tr key={profile.profileName} className={i < profiles.length - 1 ? 'border-b border-[var(--border-color)]' : ''}>
                <td className="px-4 py-2">
                  <div
                    className="w-3 h-3 rounded-full mx-auto"
                    style={{ backgroundColor: profileColors[profile.profileName] || '#6B7280' }}
                    aria-hidden="true"
                  />
                </td>
                <td className="px-4 py-2 text-sm text-[var(--text-primary)]">{profile.profileName}</td>
                <td className="px-4 py-2 text-sm text-[var(--text-primary)] text-right">
                  {new Intl.NumberFormat().format(profile.avgResponseTimeMs)}ms
                </td>
                <td className="px-4 py-2 text-sm text-[var(--text-primary)] text-right">
                  {new Intl.NumberFormat().format(profile.requestCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
