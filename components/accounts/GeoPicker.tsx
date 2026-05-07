'use client';

import { useMemo } from 'react';
import { useGeoNodes, useGeoNodeOrder } from '@/hooks/useTerritoryStore';
import type { GeoNode } from '@/types/territory';

interface GeoPickerProps {
  id?: string;
  value: string | null;
  onChange: (geoNodeId: string | null) => void;
  className?: string;
  disabled?: boolean;
}

/** Flatten the Geo tree into ordered { id, label } rows where label shows the breadcrumb. */
export function flattenGeoTree(
  nodes: Record<string, GeoNode>,
  order: string[],
): Array<{ id: string; label: string }> {
  // Children grouped by parent, in geoNodeOrder.
  const childrenByParent = new Map<string | null, GeoNode[]>();
  for (const id of order) {
    const n = nodes[id];
    if (!n) continue;
    const arr = childrenByParent.get(n.parentId) ?? [];
    arr.push(n);
    childrenByParent.set(n.parentId, arr);
  }

  const out: Array<{ id: string; label: string }> = [];
  function walk(parentId: string | null, trail: string[]) {
    const kids = childrenByParent.get(parentId) ?? [];
    for (const n of kids) {
      const nextTrail = [...trail, n.name];
      out.push({ id: n.id, label: nextTrail.join(' › ') });
      walk(n.id, nextTrail);
    }
  }
  walk(null, []);
  return out;
}

export default function GeoPicker({ id, value, onChange, className, disabled }: GeoPickerProps) {
  const nodes = useGeoNodes();
  const order = useGeoNodeOrder();
  const flat = useMemo(() => flattenGeoTree(nodes, order), [nodes, order]);

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={className}
    >
      <option value="">— none —</option>
      {flat.map((row) => (
        <option key={row.id} value={row.id}>{row.label}</option>
      ))}
    </select>
  );
}
