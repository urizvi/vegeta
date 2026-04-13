'use client';

import { useState } from 'react';
import { useActiveView, useDrillDownCountryCode, useActions } from '@/hooks/useTerritoryStore';
import Toolbar from './toolbar/Toolbar';
import TeamSidebar from './sidebar/TeamSidebar';
import WorldMapView from './map/WorldMapView';
import DrillDownMapView from './map/DrillDownMapView';
import SpreadsheetView from './spreadsheet/SpreadsheetView';

export default function TerritoryApp() {
  const activeView = useActiveView();
  const drillDownCode = useDrillDownCountryCode();
  const { setDrillDownCountryCode } = useActions();

  // Track the name of the country we drilled into (for breadcrumb)
  const [drillDownName, setDrillDownName] = useState<string | null>(null);

  function handleDrillDown(iso2: string, name: string) {
    setDrillDownName(name);
    setDrillDownCountryCode(iso2);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <Toolbar drillDownCountryName={drillDownCode ? drillDownName : null} />
      <div className="flex flex-1 overflow-hidden">
        <TeamSidebar />
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {activeView === 'map' ? (
            drillDownCode ? (
              <DrillDownMapView
                countryIso2={drillDownCode}
                countryName={drillDownName ?? drillDownCode}
              />
            ) : (
              <WorldMapView onDrillDown={handleDrillDown} />
            )
          ) : (
            <SpreadsheetView />
          )}
        </main>
      </div>
    </div>
  );
}
