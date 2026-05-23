'use client';

import { useWorkspaceSettings } from './useWorkspaceSettings';

export type NounForm = 'singular' | 'plural';

/**
 * Per-workspace label for the primary record (Account / Client / Patient /
 * Property). Defaults to "Account" / "Accounts" until settings resolve.
 */
export function useEntityNoun(form: NounForm = 'singular'): string {
  const settings = useWorkspaceSettings();
  return form === 'plural' ? settings.entityNounPlural : settings.entityNounSingular;
}
