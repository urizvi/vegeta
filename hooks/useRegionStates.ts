'use client';

import { useState, useEffect } from 'react';
import { loadAllStates, getStatesForCountries } from '@/lib/stateLoader';
import type { StateFeature } from '@/lib/stateLoader';

/** Returns all states/provinces for every country in the given ISO2 list. */
export function useRegionStates(countryIso2Codes: string[]): {
  features: StateFeature[];
  loading: boolean;
  error: string | null;
} {
  const key = countryIso2Codes.slice().sort().join(',');

  const [state, setState] = useState<{ features: StateFeature[]; loading: boolean; error: string | null }>({
    features: [],
    loading: countryIso2Codes.length > 0,
    error: null,
  });

  useEffect(() => {
    if (countryIso2Codes.length === 0) {
      setState({ features: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    loadAllStates()
      .then(() => setState({ features: getStatesForCountries(countryIso2Codes), loading: false, error: null }))
      .catch((err) => setState({ features: [], loading: false, error: String(err) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
