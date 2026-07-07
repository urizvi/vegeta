'use client';

import { forwardRef, type ReactNode } from 'react';

interface Props {
  label: string;
  glance: ReactNode;
  active: boolean;
  onClick: () => void;
}

const MapChip = forwardRef<HTMLButtonElement, Props>(function MapChip(
  { label, glance, active, onClick }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={
        `inline-flex items-center gap-1.5 rounded-full border border-hairline bg-panel px-2.5 py-1 text-xs transition-colors hover:bg-canvas ` +
        (active ? 'ring-1 ring-brand bg-brand/5' : '')
      }
    >
      {glance}
    </button>
  );
});

export default MapChip;
