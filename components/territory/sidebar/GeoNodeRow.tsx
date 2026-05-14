'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useGeoNode, useGeoChildren, useActivePaintGeoId, useActions,
  useIsGeoSelected,
} from '@/hooks/useTerritoryStore';
import ColorPickerPopover from './ColorPickerPopover';

interface GeoNodeRowProps {
  nodeId: string;
  depth: number;
  visibleIds: Set<string> | null;
  forceExpandIds: Set<string> | null;
  dragDisabled: boolean;
  descendantIds: Set<string>;
  visibleOrder?: string[];
  bulkDragSet?: Set<string> | null;
  activeDragId?: string | null;
}

export default function GeoNodeRow({
  nodeId, depth, visibleIds, forceExpandIds, dragDisabled, descendantIds,
  visibleOrder = [], bulkDragSet = null, activeDragId = null,
}: GeoNodeRowProps) {
  const node = useGeoNode(nodeId);
  const children = useGeoChildren(nodeId);
  const activeId = useActivePaintGeoId();
  const isSelected = useIsGeoSelected(nodeId);
  const bulkDragActive = bulkDragSet !== null && bulkDragSet.has(nodeId) && nodeId !== activeDragId;
  const {
    addGeoNode, updateGeoNode, removeGeoNode, setActivePaintGeo,
    toggleGeoSelection, extendGeoSelection, clearGeoSelection,
  } = useActions();
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);

  const {
    setNodeRef: setSortableNodeRef,
    attributes: sortableAttributes,
    listeners: sortableListeners,
    transform: sortableTransform,
    transition: sortableTransition,
    isDragging: sortableIsDragging,
  } = useSortable({ id: nodeId, disabled: dragDisabled });

  const { setNodeRef: setBeforeDropRef, isOver: beforeIsOver } = useDroppable({
    id: `${nodeId}::before`, data: { zone: 'before', rowId: nodeId },
  });
  const { setNodeRef: setNestDropRef, isOver: nestIsOver } = useDroppable({
    id: `${nodeId}::nest`, data: { zone: 'nest', rowId: nodeId },
  });
  const { setNodeRef: setAfterDropRef, isOver: afterIsOver } = useDroppable({
    id: `${nodeId}::after`, data: { zone: 'after', rowId: nodeId },
  });

  if (!node) return null;
  if (visibleIds && !visibleIds.has(nodeId)) return null;

  const isActive = activeId === nodeId;
  const territoryCount = node.countryCodes.length + node.stateCodes.length;
  const isInvalidDropTarget = descendantIds.has(nodeId);
  const showExpanded = forceExpandIds?.has(nodeId) ? true : expanded;

  const style = {
    transform: CSS.Transform.toString(sortableTransform),
    transition: sortableTransition,
    opacity: sortableIsDragging ? 0.4 : 1,
  };

  function commitName() {
    const next = draftName.trim();
    if (next && next !== node!.name) updateGeoNode(nodeId, { name: next });
    setEditingName(false);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const hasChildren = children.length > 0;
    const msg = hasChildren
      ? `Delete "${node!.name}" and its ${children.length} child${children.length > 1 ? 'ren' : ''}? Country/state assignments inside will be cleared.`
      : `Delete "${node!.name}"? Its country/state assignments will be cleared.`;
    if (window.confirm(msg)) removeGeoNode(nodeId, 'cascade');
  }

  return (
    <div ref={setSortableNodeRef} style={style} className="select-none">
      <div className="relative">
        {!isInvalidDropTarget && (
          <>
            <div
              ref={setBeforeDropRef}
              className={`pointer-events-auto absolute inset-x-0 top-0 h-1/3 ${beforeIsOver ? 'border-t-2 border-brand' : ''}`}
            />
            <div
              ref={setNestDropRef}
              className={`pointer-events-auto absolute inset-x-0 top-1/3 h-1/3 ${nestIsOver ? 'bg-brand-soft' : ''}`}
            />
            <div
              ref={setAfterDropRef}
              className={`pointer-events-auto absolute inset-x-0 bottom-0 h-1/3 ${afterIsOver ? 'border-b-2 border-brand' : ''}`}
            />
          </>
        )}

        <div
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              toggleGeoSelection(nodeId);
              return;
            }
            if (e.shiftKey) {
              e.preventDefault();
              extendGeoSelection(nodeId, visibleOrder);
              return;
            }
            clearGeoSelection();
            setActivePaintGeo(isActive ? null : nodeId);
          }}
          data-geo-node-row=""
          tabIndex={-1}
          className={`group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
            isActive
              ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
              : isSelected
                ? 'bg-brand-soft/60 ring-1 ring-brand/40'
                : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
          } ${isInvalidDropTarget ? 'opacity-30' : ''} ${bulkDragActive ? 'opacity-40' : ''}`}
          style={{ paddingLeft: 6 + depth * 14, cursor: 'pointer' }}
          role="button"
          aria-pressed={isActive}
          title={isActive ? 'Click to stop painting' : 'Click to paint with this Geo'}
        >
          <button
            {...sortableAttributes}
            {...sortableListeners}
            onClick={(e) => e.stopPropagation()}
            className={`flex h-4 w-3 cursor-grab items-center justify-center text-slate-300 hover:text-slate-600 ${dragDisabled ? 'invisible' : ''}`}
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <svg viewBox="0 0 8 16" className="h-3 w-2" fill="currentColor">
              <circle cx="2" cy="3" r="1" /><circle cx="6" cy="3" r="1" />
              <circle cx="2" cy="8" r="1" /><circle cx="6" cy="8" r="1" />
              <circle cx="2" cy="13" r="1" /><circle cx="6" cy="13" r="1" />
            </svg>
          </button>

          {children.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="flex h-4 w-4 items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label={showExpanded ? 'Collapse' : 'Expand'}
            >
              <svg className={`h-3 w-3 transition-transform ${showExpanded ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.22 3.22a.75.75 0 011.06 0l4 4a.75.75 0 010 1.06l-4 4a.75.75 0 11-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
              </svg>
            </button>
          ) : (
            <span className="w-4" />
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setPickerAnchor(e.currentTarget.getBoundingClientRect());
            }}
            className="relative h-4 w-4 flex-shrink-0 rounded border border-slate-300 dark:border-slate-600"
            style={
              node.color
                ? { background: node.color }
                : {
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #d4d4d8 0 2px, transparent 2px 4px)',
                  }
            }
            title={node.color ?? 'Inherits parent color — click to set'}
            aria-label="Pick color"
          />

          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                else if (e.key === 'Escape') setEditingName(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 rounded bg-white px-1 py-0.5 text-sm outline-none ring-1 ring-indigo-400 dark:bg-slate-900"
            />
          ) : (
            <span
              className="flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDraftName(node.name);
                setEditingName(true);
              }}
            >
              {node.name}
            </span>
          )}

          <span
            className="text-[10px] tabular-nums text-slate-400"
            title={`${node.countryCodes.length} countries, ${node.stateCodes.length} states`}
          >
            {territoryCount}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const id = addGeoNode('New', nodeId);
              setActivePaintGeo(id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-slate-300 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="Add child"
            aria-label="Add child"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 018 1z" />
            </svg>
          </button>

          <button
            onClick={handleDelete}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950"
            title="Delete"
            aria-label="Delete"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      </div>

      {pickerAnchor && (
        <ColorPickerPopover
          value={node.color}
          onChange={(next) => updateGeoNode(nodeId, { color: next })}
          onClose={() => setPickerAnchor(null)}
          anchorRect={pickerAnchor}
        />
      )}

      <div
        className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out ${
          showExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        aria-hidden={!showExpanded}
      >
        <div className="overflow-hidden">
          {children.map((c) => (
            <GeoNodeRow
              key={c.id}
              nodeId={c.id}
              depth={depth + 1}
              visibleIds={visibleIds}
              forceExpandIds={forceExpandIds}
              dragDisabled={dragDisabled}
              descendantIds={descendantIds}
              visibleOrder={visibleOrder}
              bulkDragSet={bulkDragSet}
              activeDragId={activeDragId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
