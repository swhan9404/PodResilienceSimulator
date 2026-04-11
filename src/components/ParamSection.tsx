import { useState } from 'react';

interface ParamSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function ParamSection({ title, children, defaultOpen = true }: ParamSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer py-2 flex items-center justify-between"
      >
        <span>{title}</span>
        <span
          className="text-xs transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          {'>'}
        </span>
      </div>
      {open && (
        <div className="pt-2 flex flex-col gap-4">
          {children}
        </div>
      )}
    </div>
  );
}
