'use client';

import { useEffect, useState } from 'react';
import { useTerritoryStore } from '@/store/territoryStore';
import { getAccounts, getFieldDefinitions, getMembers } from '@/lib/directus';
import { useAuth } from '@/hooks/useAuth';

interface State {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unauthenticated';
  error: Error | null;
}

/**
 * Fetches accounts, field definitions, and the members mirror from Directus
 * once on mount and hydrates the Zustand store. Every read selector in the
 * app continues to work unchanged — this hook is the only write path.
 */
export function useDirectusAccounts(): State {
  const { status: authStatus } = useAuth();
  const [fetchState, setFetchState] = useState<State>({ status: 'loading', error: null });

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
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
        setFetchState({ status: 'ready', error: null });
      } catch (err) {
        if (cancelled) return;
        setFetchState({ status: 'error', error: err as Error });
      }
    })();
    return () => { cancelled = true; };
  }, [authStatus]);

  if (authStatus === 'unauthenticated') return { status: 'unauthenticated', error: null };
  if (authStatus === 'loading') return { status: 'loading', error: null };
  return fetchState;
}
