'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import {
  invalidateWorkspaceSettings,
  useWorkspaceSettings,
  type ModulesEnabled,
} from '@/hooks/useWorkspaceSettings';
import { updateWorkspaceSettings } from '@/lib/workspace';

interface FormState {
  entity_noun_singular: string;
  entity_noun_plural: string;
  owner_noun: string;
  brand_color: string;
  modules_enabled: ModulesEnabled;
}

const MODULE_LABELS: Record<keyof ModulesEnabled, string> = {
  territory: 'Territory map',
  contacts: 'Contacts',
  activities: 'Activity timeline',
  tasks: 'Tasks',
};

function settingsToForm(s: ReturnType<typeof useWorkspaceSettings>): FormState {
  return {
    entity_noun_singular: s.entityNounSingular,
    entity_noun_plural: s.entityNounPlural,
    owner_noun: s.ownerNoun,
    brand_color: s.brandColor ?? '',
    modules_enabled: { ...s.modulesEnabled },
  };
}

export default function WorkspaceSettingsForm() {
  const router = useRouter();
  const workspaceId = useCurrentWorkspaceId();
  const settings = useWorkspaceSettings();

  const singularId = useId();
  const pluralId = useId();
  const ownerId = useId();
  const colorId = useId();

  const [form, setForm] = useState<FormState>(() => settingsToForm(settings));
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (hydrated) return;
    setForm(settingsToForm(settings));
    setHydrated(true);
  }, [settings, hydrated]);

  function toggleModule(key: keyof ModulesEnabled) {
    setForm((f) => ({
      ...f,
      modules_enabled: { ...f.modules_enabled, [key]: !f.modules_enabled[key] },
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setError(null);
    setSubmitting(true);
    try {
      const trimmedColor = form.brand_color.trim();
      await updateWorkspaceSettings(workspaceId, {
        entity_noun_singular: form.entity_noun_singular.trim(),
        entity_noun_plural: form.entity_noun_plural.trim(),
        owner_noun: form.owner_noun.trim(),
        modules_enabled: form.modules_enabled,
        brand_color: trimmedColor === '' ? null : trimmedColor,
      });
      invalidateWorkspaceSettings(workspaceId);
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Workspace settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Names and toggles that shape how this workspace reads. Changes apply immediately after save.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={singularId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Record name (singular)
              </label>
              <input
                id={singularId}
                value={form.entity_noun_singular}
                onChange={(e) => setForm((f) => ({ ...f, entity_noun_singular: e.target.value }))}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor={pluralId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Record name (plural)
              </label>
              <input
                id={pluralId}
                value={form.entity_noun_plural}
                onChange={(e) => setForm((f) => ({ ...f, entity_noun_plural: e.target.value }))}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor={ownerId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Owner role name
            </label>
            <input
              id={ownerId}
              value={form.owner_noun}
              onChange={(e) => setForm((f) => ({ ...f, owner_noun: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor={colorId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Brand color
            </label>
            <div className="flex items-center gap-2">
              <input
                id={colorId}
                type="color"
                value={form.brand_color || '#000000'}
                onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-800"
              />
              <input
                value={form.brand_color}
                onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                placeholder="#3b82f6 — leave blank for default"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {form.brand_color && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, brand_color: '' }))}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              Modules
            </legend>
            <div className="space-y-1.5">
              {(Object.keys(MODULE_LABELS) as Array<keyof ModulesEnabled>).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.modules_enabled[key]}
                    onChange={() => toggleModule(key)}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  {MODULE_LABELS[key]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            Preview: a {form.entity_noun_singular.toLowerCase() || 'record'} owned by a{' '}
            {form.owner_noun.toLowerCase() || 'owner'};{' '}
            {form.entity_noun_plural.toLowerCase() || 'records'} list page under <code>/accounts</code>.
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500">
              {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : ''}
            </span>
            <button
              type="submit"
              disabled={submitting || !workspaceId}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
