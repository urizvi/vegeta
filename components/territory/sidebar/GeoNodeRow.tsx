'use client';

import { useState } from 'react';
import {
  useGeoNode, useGeoChildren, useActivePaintGeoId, useActions,
} from '@/hooks/useTerritoryStore';

interface GeoNodeRowProps {
  nodeId: string;
  depth: number;
}

export default function GeoNodeRow({ nodeId, depth }: GeoNodeRowProps) {
  const node = useGeoNode(nodeId);
  const children = useGeoChildren(nodeId);
  const activeId = useActivePaintGeoId();
  const { addGeoNode, updateGeoNode, removeGeoNode, setActivePaintGeo } = useActions();
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  if (!node) return null;
  const isActive = activeId === nodeId;
  const territoryCount = node.countryCodes.length + node.stateCodes.length;

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
    <div className="select-none">
      <div
        onClick={() => setActivePaintGeo(isActive ? null : nodeId)}
        className={`group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm transition-colors ${
          isActive
            ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
            : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
        }`}
        style={{ paddingLeft: 6 + depth * 14, cursor: 'pointer' }}
        role="button"
        aria-pressed={isActive}
        title={isActive ? 'Click to stop painting' : 'Click to paint with this Geo'}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="flex h-4 w-4 items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.22 3.22a.75.75 0 011.06 0l4 4a.75.75 0 010 1.06l-4 4a.75.75 0 11-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
            </svg>
          </button>
        ) : (
          <span className="w-4" />
        )}

        <label
          className="relative h-4 w-4 flex-shrink-0 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
          style={
            node.color
              ? { background: node.color }
              : {
                  // Diagonal stripe to signal "inherits"
                  backgroundImage:
                    'repeating-linear-gradient(45deg, #d4d4d8 0 2px, transparent 2px 4px)',
                }
          }
          title={node.color ?? 'Inherits parent color — click to set'}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="color"
            value={node.color ?? '#888888'}
            onChange={(e) => updateGeoNode(nodeId, { color: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>

        {node.color && node.parentId !== null && (
          <button
            onClick={(e) => { e.stopPropagation(); updateGeoNode(nodeId, { color: null }); }}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-slate-300 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-600 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="Inherit color from parent"
            aria-label="Inherit color from parent"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3a5 5 0 014.546 7.071l1.058 1.058A6.5 6.5 0 008 1.5V0L4.5 3 8 6V4.5a3.5 3.5 0 00-3.5 3.5H3a5 5 0 015-5zm0 10a5 5 0 01-4.546-7.071L2.396 4.871A6.5 6.5 0 008 14.5V16l3.5-3-3.5-3v1.5a3.5 3.5 0 003.5-3.5H13a5 5 0 01-5 5z" />
            </svg>
          </button>
        )}

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

      {expanded && children.map((c) => (
        <GeoNodeRow key={c.id} nodeId={c.id} depth={depth + 1} />
      ))}
    </div>
  );
}
