'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveView, useDrillDownCountryCode, useActions } from '@/hooks/useTerritoryStore';
import { useModuleEnabled } from '@/hooks/useModuleEnabled';
import Toolbar from './toolbar/Toolbar';
import TeamSidebar from './sidebar/TeamSidebar';
import WorldMapView from './map/WorldMapView';
import DrillDownMapView from './map/DrillDownMapView';
import SpreadsheetView from './spreadsheet/SpreadsheetView';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';

export default function TerritoryApp() {
  const territoryEnabled = useModuleEnabled('territory');
  const router = useRouter();
  const activeView = useActiveView();
  const drillDownCode = useDrillDownCountryCode();
  const { setDrillDownCountryCode } = useActions();

  // Track the name of the country we drilled into (for breadcrumb)
  const [drillDownName, setDrillDownName] = useState<string | null>(null);

  type TransitionState =
    | { phase: 'idle' }
    | {
        phase: 'entering';
        targetIso: string;
        targetCenter: [number, number];
        targetZoom: number;
        crossFade: boolean;
      }
    | { phase: 'exiting'; sourceIso: string; crossFade: boolean };

  const [transition, setTransition] = useState<TransitionState>({ phase: 'idle' });
  const prevDrillRef = useRef<string | null>(drillDownCode);

  useEffect(() => {
    const prev = prevDrillRef.current;
    const curr = drillDownCode;
    prevDrillRef.current = curr;
    if (prev === curr) return;
    if (prev === null && curr !== null) {
      const crossFade = curr === 'US';
      const target = COUNTRY_CENTROIDS[curr] ?? [0, 20];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTransition({
        phase: 'entering',
        targetIso: curr,
        targetCenter: target,
        targetZoom: 6,
        crossFade,
      });
      if (crossFade) {
        const id = window.setTimeout(() => setTransition({ phase: 'idle' }), 200);
        return () => window.clearTimeout(id);
      }
    } else if (prev !== null && curr === null) {
      const crossFade = prev === 'US';
      setTransition({ phase: 'exiting', sourceIso: prev, crossFade });
      if (crossFade) {
        const id = window.setTimeout(() => setTransition({ phase: 'idle' }), 200);
        return () => window.clearTimeout(id);
      }
    }
  }, [drillDownCode]);

  useEffect(() => {
    if (!territoryEnabled) router.replace('/accounts');
  }, [territoryEnabled, router]);

  if (!territoryEnabled) return null;

  function handleDrillDown(iso2: string, name: string) {
    setDrillDownName(name);
    setDrillDownCountryCode(iso2);
  }

  function renderMap() {
    if (transition.phase === 'entering' && !transition.crossFade) {
      return (
        <WorldMapView
          onDrillDown={handleDrillDown}
          cameraTarget={{
            center: transition.targetCenter,
            zoom: transition.targetZoom,
            durationMs: 300,
          }}
          onCameraSettled={() => setTransition({ phase: 'idle' })}
        />
      );
    }
    if (transition.phase === 'entering' && transition.crossFade) {
      return (
        <>
          <WorldMapView
            onDrillDown={handleDrillDown}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-0"
          />
          <DrillDownMapView
            countryIso2={transition.targetIso}
            countryName={drillDownName ?? transition.targetIso}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-100"
          />
        </>
      );
    }
    if (transition.phase === 'exiting' && !transition.crossFade) {
      return (
        <DrillDownMapView
          countryIso2={transition.sourceIso}
          countryName={drillDownName ?? transition.sourceIso}
          cameraTarget={{
            center: [0, 20],
            zoom: 1,
            durationMs: 300,
          }}
          onCameraSettled={() => setTransition({ phase: 'idle' })}
        />
      );
    }
    if (transition.phase === 'exiting' && transition.crossFade) {
      return (
        <>
          <DrillDownMapView
            countryIso2={transition.sourceIso}
            countryName={drillDownName ?? transition.sourceIso}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-0"
          />
          <WorldMapView
            onDrillDown={handleDrillDown}
            className="motion-safe:transition-opacity motion-safe:duration-200 opacity-100"
          />
        </>
      );
    }
    // phase: 'idle'
    if (drillDownCode) {
      return (
        <DrillDownMapView
          countryIso2={drillDownCode}
          countryName={drillDownName ?? drillDownCode}
        />
      );
    }
    return <WorldMapView onDrillDown={handleDrillDown} />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Toolbar drillDownCountryName={drillDownCode ? drillDownName : null} />
      <div className="flex flex-1 overflow-hidden">
        <TeamSidebar />
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {activeView === 'map' ? renderMap() : <SpreadsheetView />}
        </main>
      </div>
    </div>
  );
}
