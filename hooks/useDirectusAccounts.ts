'use client';

import { useEffect, useState } from 'react';
import { useTerritoryStore } from '@/store/territoryStore';
import { getAccounts, getFieldDefinitions, getMembers } from '@/lib/directus';

interface State {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: Error | null;
}

/**
 * Fetches accounts, field definitions, and the members mirror from Directus
 * once on mount and hydrates the Zustand store. Every read selector in the
 * app continues to work unchanged — this hook is the only write path.
 */
export function useDirectusAccounts(): State {
  const [state, setState] = useState<State>({ status: 'loading', error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accounts, fieldDefs, members] = await Promise.all([
          getAccounts(),
          getFieldDefinitions(),
          getMembers(),
        ]);
        if (cancelled) return;
        const { hydrateAccounts, hydrateFieldDefs, hydrateMembers } = useTerritoryStore.getState();
        hydrateFieldDefs(fieldDefs);
        hydrateMembers(members);
        hydrateAccounts(accounts);
        setState({ status: 'ready', error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ status: 'error', error: err as Error });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
