interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
}

export function NumberInput({ label, value, onChange, min, step, disabled }: NumberInputProps) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        min={min}
        step={step}
        disabled={disabled}
        className="w-20 px-2 py-1 text-sm text-right rounded border border-[var(--border-color)] bg-[var(--bg-dominant)] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </label>
  );
}
