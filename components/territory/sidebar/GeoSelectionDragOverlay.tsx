'use client';

import { useGeoNode } from '@/hooks/useTerritoryStore';

interface Props {
  activeId: string;
  count: number;
}

export default function GeoSelectionDragOverlay({ activeId, count }: Props) {
  const active = useGeoNode(activeId);
  if (!active) return null;

  const extra = count - 1;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[12px] font-medium text-brand-ink shadow-md">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
        style={{ background: active.color ?? 'transparent' }}
      />
      <span className="truncate max-w-[180px]">{active.name}</span>
      {extra > 0 && (
        <span className="rounded-full bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
          +{extra}
        </span>
      )}
    </div>
  );
}
