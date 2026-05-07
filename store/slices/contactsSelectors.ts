import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '../territoryStore';
import type { Contact } from '@/types/crm';

export const useContacts = () => useTerritoryStore((s) => s.contacts);
export const useContactOrder = () => useTerritoryStore((s) => s.contactOrder);
export const useContact = (id: string | null) =>
  useTerritoryStore((s) => (id ? s.contacts[id] ?? null : null));

/** Contacts belonging to a single account, in insertion order. */
export const useContactsForAccount = (accountId: string | null) =>
  useTerritoryStore(
    useShallow((s) =>
      accountId
        ? s.contactOrder
            .map((id) => s.contacts[id])
            .filter((c): c is Contact => !!c && c.accountId === accountId)
        : [],
    ),
  );
