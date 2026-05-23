import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '../territoryStore';
import type { GeoNode } from '@/types/territory';

export const useGeoNodes = () => useTerritoryStore((s) => s.geoNodes);
export const useGeoNodeOrder = () => useTerritoryStore((s) => s.geoNodeOrder);
export const useGeoNode = (id: string | null) =>
  useTerritoryStore((s) => (id ? s.geoNodes[id] ?? null : null));

/** Direct children of `parentId` in stable `geoNodeOrder`. `null` returns root nodes. */
export const useGeoChildren = (parentId: string | null) =>
  useTerritoryStore(
    useShallow((s) =>
      s.geoNodeOrder
        .map((id) => s.geoNodes[id])
        .filter((n): n is GeoNode => !!n && n.parentId === parentId),
    ),
  );

export const useActivePaintGeoId = () => useTerritoryStore((s) => s.activePaintGeoId);
export const useActivePaintGeo = () =>
  useTerritoryStore((s) => (s.activePaintGeoId ? s.geoNodes[s.activePaintGeoId] ?? null : null));
export const useActiveEraser = () => useTerritoryStore((s) => s.activeEraser);
export const useActiveSelect = () => useTerritoryStore((s) => s.selectActive);

export const useCanUndoGeo = () => useTerritoryStore((s) => s.geoOpUndoStack.length > 0);
export const useCanRedoGeo = () => useTerritoryStore((s) => s.geoOpRedoStack.length > 0);

/** Resolve a node's effective color by walking up to the nearest ancestor with a non-null color. */
export const useGeoNodeEffectiveColor = (id: string | null): string | null =>
  useTerritoryStore((s) => {
    let cur: string | null = id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const n = s.geoNodes[cur];
      if (!n) return null;
      if (n.color) return n.color;
      cur = n.parentId;
    }
    return null;
  });
