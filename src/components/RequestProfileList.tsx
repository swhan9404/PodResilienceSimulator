import { useState } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { ParamSection } from './ParamSection';
import type { RequestProfile } from '../simulation/types';

const COLOR_PRESETS = [
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#14B8A6', name: 'Teal' },
  { hex: '#F59E0B', name: 'Amber' },
];

export function RequestProfileList() {
  const profiles = useSimulationStore((s) => s.config.requestProfiles);
  const setProfiles = useSimulationStore((s) => s.setRequestProfiles);
  const disabled = useSimulationStore((s) => s.playback) !== 'idle';
  const [openColorIdx, setOpenColorIdx] = useState<number | null>(null);

  const updateProfile = (idx: number, partial: Partial<RequestProfile>) => {
    const updated = profiles.map((p, i) => i === idx ? { ...p, ...partial } : p);
    setProfiles(updated);
  };

  const addProfile = () => {
    const usedColors = new Set(profiles.map(p => p.color));
    const nextColor = COLOR_PRESETS.find(c => !usedColors.has(c.hex))?.hex ?? COLOR_PRESETS[0].hex;
    setProfiles([...profiles, { name: `profile${profiles.length + 1}`, latencyMs: 1000, ratio: 1, color: nextColor }]);
  };

  const removeProfile = (idx: number) => {
    setProfiles(profiles.filter((_, i) => i !== idx));
  };

  return (
    <ParamSection title="Request Profiles">
      {/* Column headers */}
      <div className="grid grid-cols-[16px_64px_72px_48px_16px] gap-2 text-xs text-[var(--text-secondary)] mb-1">
        <span></span>
        <span>Name</span>
        <span className="text-right">ms</span>
        <span className="text-right">Ratio</span>
        <span></span>
      </div>

      {/* Profile rows */}
      {profiles.map((profile, idx) => (
        <div key={idx}>
          <div className="grid grid-cols-[16px_64px_72px_48px_16px] gap-2 items-center">
            {/* Color dot */}
            <button
              onClick={() => !disabled && setOpenColorIdx(openColorIdx === idx ? null : idx)}
              aria-label={COLOR_PRESETS.find(c => c.hex === profile.color)?.name ?? 'Color'}
              className="w-4 h-4 rounded-full cursor-pointer disabled:cursor-not-allowed"
              style={{ backgroundColor: profile.color }}
              disabled={disabled}
            />

            {/* Name input */}
            <input
              type="text"
              value={profile.name}
              onChange={(e) => updateProfile(idx, { name: e.target.value })}
              disabled={disabled}
              className="w-16 text-sm bg-[var(--bg-dominant)] border-none outline-none text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Latency input */}
            <input
              type="number"
              value={profile.latencyMs}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!isNaN(n)) updateProfile(idx, { latencyMs: n });
              }}
              min={1}
              disabled={disabled}
              className="w-[72px] text-sm text-right px-1 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-dominant)] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Ratio input */}
            <input
              type="number"
              value={profile.ratio}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!isNaN(n)) updateProfile(idx, { ratio: n });
              }}
              min={0}
              step={1}
              disabled={disabled}
              className="w-12 text-sm text-right px-1 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-dominant)] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Delete button */}
            {!disabled && profiles.length > 1 ? (
              <button
                onClick={() => removeProfile(idx)}
                className="text-xs text-[var(--text-secondary)] hover:text-[#EF4444] cursor-pointer"
              >
                x
              </button>
            ) : (
              <span />
            )}
          </div>

          {/* Color palette */}
          {openColorIdx === idx && (
            <div className="flex gap-1 py-1 pl-6">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => { updateProfile(idx, { color: c.hex }); setOpenColorIdx(null); }}
                  aria-label={c.name}
                  className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                    profiles[idx].color === c.hex ? 'border-white ring-2 ring-blue-500' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Add button */}
      {!disabled && (
        <button onClick={addProfile} className="text-xs text-[var(--text-secondary)] hover:text-[#3B82F6] cursor-pointer mt-1">
          + Add Profile
        </button>
      )}

      {/* Ratio normalization hint */}
      <p className="text-xs text-[var(--text-secondary)] mt-2">Ratios auto-normalize to 100%</p>
    </ParamSection>
  );
}
