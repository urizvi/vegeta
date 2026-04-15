'use client';

import { useState, useEffect } from 'react';
import { loadAllStates, getStatesForCountry, isCached } from '@/lib/stateLoader';
import type { StateFeature } from '@/lib/stateLoader';
export type { StateFeature } from '@/lib/stateLoader';

interface StateHookResult {
  features: StateFeature[];
  loading: boolean;
  error: string | null;
}

export function useCountryStates(countryIso2: string | null): StateHookResult {
  const [syncedIso2, setSyncedIso2] = useState(countryIso2);
  const [state, setState] = useState<StateHookResult>(() => {
    if (!countryIso2) return { features: [], loading: false, error: null };
    return isCached(countryIso2)
      ? { features: getStatesForCountry(countryIso2), loading: false, error: null }
      : { features: [], loading: true, error: null };
  });

  // getDerivedStateFromProps pattern: sync state during render when iso2 changes
  if (syncedIso2 !== countryIso2) {
    setSyncedIso2(countryIso2);
    if (!countryIso2) {
      setState({ features: [], loading: false, error: null });
    } else if (isCached(countryIso2)) {
      setState({ features: getStatesForCountry(countryIso2), loading: false, error: null });
    } else {
      setState({ features: [], loading: true, error: null });
    }
  }

  useEffect(() => {
    if (!countryIso2 || isCached(countryIso2)) return;
    loadAllStates()
      .then(() => setState({ features: getStatesForCountry(countryIso2), loading: false, error: null }))
      .catch((err: unknown) => setState({ features: [], loading: false, error: String(err) }));
  }, [countryIso2]);

  return state;
}
