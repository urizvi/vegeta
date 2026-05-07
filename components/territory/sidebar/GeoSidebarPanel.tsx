'use client';

import { useGeoChildren, useActions } from '@/hooks/useTerritoryStore';
import GeoNodeRow from './GeoNodeRow';

export default function GeoSidebarPanel() {
  const roots = useGeoChildren(null);
  const { addGeoNode, setActivePaintGeo } = useActions();

  return (
    <>
      <div className="border-b border-hairline px-3 py-2">
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
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
            <p className="text-sm font-medium text-ink-muted">No geos yet.</p>
            <p className="text-xs text-ink-faint">
              Click <span className="font-medium text-ink-body">&ldquo;New geo&rdquo;</span> to start a hierarchy.
            </p>
          </div>
        ) : (
          roots.map((node) => (
            <GeoNodeRow key={node.id} nodeId={node.id} depth={0} />
          ))
        )}
      </div>

      <div className="border-t border-hairline bg-sunken/50 px-3 py-2 text-[11px] text-ink-muted">
        <p className="leading-snug">
          <span className="font-semibold text-ink-body">Tip:</span> click a Geo to enter paint mode, then click countries on the map to assign them.
        </p>
      </div>
    </>
  );
}
