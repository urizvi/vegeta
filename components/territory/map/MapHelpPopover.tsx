'use client';

import { useEffect, useRef } from 'react';

export function MapHelpPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  if (!open) return null;

  const rows: Array<[string, string]> = [
    ['↑ ↓ ← →', 'Pan the map'],
    ['+ / -', 'Zoom in / out'],
    ['0', 'Reset view'],
    ['Shift + click', 'Add to selection'],
    ['⌘ / Ctrl + click', 'Toggle selection'],
    ['Drag (in Select mode)', 'Lasso multi-select'],
    ['Esc', 'Close popover · clear selection · clear paint/eraser'],
    ['?', 'Toggle this popover'],
    ['/', 'Focus search'],
    ['g', 'Focus Geos sidebar'],
  ];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Map keyboard shortcuts"
      className="absolute right-4 top-14 z-30 w-[360px] rounded-xl border border-hairline bg-canvas/95 p-4 text-[12px] shadow-lg backdrop-blur-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Keyboard shortcuts
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-ink-body">
        {rows.map(([key, desc]) => (
          <div key={key} className="contents">
            <dt className="font-mono text-ink">{key}</dt>
            <dd className="text-ink-muted">{desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
