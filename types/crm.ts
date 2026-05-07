/**
 * Phase 3 entities — people associated with an account, the activity timeline,
 * and to-dos. All three are workspace-scoped (handled at the read/write layer)
 * and carry a `fields` JSON map keyed by `field_definitions.id` rows whose
 * `entity` matches the parent type.
 */

export type ActivityKind = 'note' | 'call' | 'email' | 'meeting';

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  fields: Record<string, string | number>;
}

export interface Activity {
  id: string;
  accountId: string;
  contactId: string | null;
  kind: ActivityKind;
  body: string | null;
  occurredAt: string | null; // ISO timestamp
  createdBy: string | null;  // members.id
  fields: Record<string, string | number>;
}

export interface Task {
  id: string;
  accountId: string | null; // standalone tasks allowed
  title: string;
  dueAt: string | null;       // ISO
  completedAt: string | null; // null = open
  assigneeId: string | null;  // members.id
  fields: Record<string, string | number>;
}
