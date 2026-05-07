import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Contact } from '@/types/crm';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[contactsSlice] ${label} failed`, err));
}

export type ContactInput = Omit<Contact, 'id' | 'fields'> & { fields?: Record<string, string | number> };

export interface ContactsSlice {
  contacts: Record<string, Contact>;
  contactOrder: string[];

  addContact: (input: ContactInput) => string;
  updateContact: (id: string, patch: Partial<Omit<Contact, 'id'>>) => void;
  removeContact: (id: string) => void;

  hydrateContacts: (contacts: Contact[]) => void;
}

export const contactsPersistKeys = ['contacts', 'contactOrder'] as const satisfies readonly (keyof ContactsSlice)[];

export const createContactsSlice: StateCreator<TerritoryStore, [], [], ContactsSlice> = (set) => ({
  contacts: {},
  contactOrder: [],

  addContact(input) {
    const id = crypto.randomUUID();
    const contact: Contact = {
      id,
      accountId: input.accountId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      title: input.title ?? null,
      isPrimary: input.isPrimary ?? false,
      fields: input.fields ?? {},
    };
    set((s) => ({
      contacts: { ...s.contacts, [id]: contact },
      contactOrder: [...s.contactOrder, id],
    }));
    fireWrite(`createContact(${id})`, directusWrite.createContact(contact));
    return id;
  },

  updateContact(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.contacts[id]) return s;
      didApply = true;
      return { contacts: { ...s.contacts, [id]: { ...s.contacts[id], ...patch } } };
    });
    if (didApply) fireWrite(`updateContact(${id})`, directusWrite.updateContactRemote(id, patch));
  },

  removeContact(id) {
    let didApply = false;
    set((s) => {
      if (!s.contacts[id]) return s;
      didApply = true;
      const contacts = { ...s.contacts };
      delete contacts[id];
      return {
        contacts,
        contactOrder: s.contactOrder.filter((cid) => cid !== id),
      };
    });
    if (didApply) fireWrite(`deleteContact(${id})`, directusWrite.deleteContact(id));
  },

  hydrateContacts(contacts) {
    const map: Record<string, Contact> = {};
    const order: string[] = [];
    contacts.forEach((c) => {
      map[c.id] = c;
      order.push(c.id);
    });
    set({ contacts: map, contactOrder: order });
  },
});
