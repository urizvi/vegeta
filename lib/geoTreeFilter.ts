import type { GeoNode } from '@/types/territory';

interface FilterResult {
  /** Ids that should render (matches + their ancestors). */
  visibleIds: Set<string>;
  /** Ids that should be force-expanded (ancestors of matches). */
  expandIds: Set<string>;
}

/**
 * Returns the set of node ids to render and the set to force-expand.
 * When `query` is empty, returns null — caller should render the full tree
 * with its normal expanded state.
 */
export function filterGeoTree(
  nodes: Record<string, GeoNode>,
  query: string,
): FilterResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const visible = new Set<string>();
  const expand = new Set<string>();

  for (const node of Object.values(nodes)) {
    if (!node.name.toLowerCase().includes(q)) continue;
    visible.add(node.id);
    let parentId = node.parentId;
    while (parentId !== null) {
      const parent = nodes[parentId];
      if (!parent) break;
      visible.add(parent.id);
      expand.add(parent.id);
      parentId = parent.parentId;
    }
  }

  return { visibleIds: visible, expandIds: expand };
}
