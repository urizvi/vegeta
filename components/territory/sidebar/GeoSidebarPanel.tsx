'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useGeoChildren, useGeoNodes, useGeoNodeOrder, useActions } from '@/hooks/useTerritoryStore';
import { useSelectedGeoNodeIds } from '@/store/slices/geoSelectionSelectors';
import { filterGeoTree } from '@/lib/geoTreeFilter';
import GeoNodeRow from './GeoNodeRow';
import SidebarSearchInput from './SidebarSearchInput';

function descendantsOfLocal(nodes: ReturnType<typeof useGeoNodes>, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of Object.values(nodes)) {
      if (n.parentId === cur) {
        out.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return out;
}

export default function GeoSidebarPanel() {
  const roots = useGeoChildren(null);
  const nodes = useGeoNodes();
  const order = useGeoNodeOrder();
  const { addGeoNode, setActivePaintGeo, reorderGeoNode, clearGeoSelection } = useActions();
  const selectedGeoNodeIds = useSelectedGeoNodeIds();

  const [query, setQuery] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const filter = useMemo(() => filterGeoTree(nodes, query), [nodes, query]);

  const descendantIds = useMemo(
    () => (activeDragId ? descendantsOfLocal(nodes, activeDragId) : new Set<string>()),
    [activeDragId, nodes],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragDisabled = filter !== null;

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const overNode = nodes[overId];
    if (!overNode) return;

    const zone = (over.data.current as { zone?: 'before' | 'nest' | 'after' } | undefined)?.zone ?? 'after';

    if (zone === 'nest') {
      reorderGeoNode(activeId, overId, null);
      return;
    }

    const newParentId = overNode.parentId;
    if (zone === 'before') {
      reorderGeoNode(activeId, newParentId, overId);
      return;
    }
    const overIndex = order.indexOf(overId);
    let beforeId: string | null = null;
    for (let i = overIndex + 1; i < order.length; i += 1) {
      const nid = order[i];
      if (nodes[nid]?.parentId === newParentId) {
        beforeId = nid;
        break;
      }
    }
    reorderGeoNode(activeId, newParentId, beforeId);
  }

  const sortableIds = filter
    ? order.filter((id) => filter.visibleIds.has(id))
    : order;

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-hairline px-3 py-2">
        <button
          onClick={() => {
            const id = addGeoNode('New Geo', null);
            setActivePaintGeo(id);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand py-1.5 text-[11px] font-semibold tracking-tight text-white shadow-brand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a.75.75 0 01.75.75V7.25h5a.75.75 0 010 1.5h-5v5a.75.75 0 01-1.5 0v-5h-5a.75.75 0 010-1.5h5V2.25A.75.75 0 018 1.5z" />
          </svg>
          New geo
        </button>
        <SidebarSearchInput id="geo-sidebar-search" value={query} onChange={setQuery} placeholder="Search geos…" />
      </div>

      <div
        className="flex-1 overflow-y-auto px-2 py-2"
        onClick={(e) => { if (e.target === e.currentTarget) clearGeoSelection(); }}
      >
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
            <p className="text-sm font-medium text-ink-muted">No geos yet.</p>
            <p className="text-xs text-ink-faint">
              Click <span className="font-medium text-ink-body">&ldquo;New geo&rdquo;</span> to start a hierarchy.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {roots
                .filter((n) => !filter || filter.visibleIds.has(n.id))
                .map((node) => (
                  <GeoNodeRow
                    key={node.id}
                    nodeId={node.id}
                    depth={0}
                    visibleIds={filter?.visibleIds ?? null}
                    forceExpandIds={filter?.expandIds ?? null}
                    dragDisabled={dragDisabled}
                    descendantIds={descendantIds}
                    visibleOrder={sortableIds}
                    bulkDragActive={false}
                  />
                ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="border-t border-hairline bg-sunken/50 px-3 py-2 text-[11px] text-ink-muted">
        <p className="leading-snug">
          {dragDisabled ? (
            <><span className="font-semibold text-ink-body">Tip:</span> clear search to drag-reorder.</>
          ) : (
            <><span className="font-semibold text-ink-body">Tip:</span> drag rows to reorder. Drop on the middle of a row to nest.</>
          )}
        </p>
      </div>
    </>
  );
}
