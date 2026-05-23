'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkspace } from '@/lib/workspace';
import {
  SEED_TEMPLATES,
  type ModulesEnabledSeed,
  type SeedTemplateId,
  type WorkspaceSettingsSeed,
} from '@/lib/seedTemplates';

const TEMPLATE_ORDER: SeedTemplateId[] = ['sales', 'agency', 'real-estate', 'blank'];

const TEMPLATE_DESCRIPTIONS: Record<SeedTemplateId, string> = {
  sales: 'Pipeline of accounts with reps and territory map. Won/Churned stages.',
  agency: 'Client roster with account managers. No territory map by default.',
  'real-estate': 'Property pipeline with agents. Listed → Sold workflow.',
  blank: 'Generic records with two stages. Pick this if none of the above fit.',
};

const MODULE_LABELS: Record<keyof ModulesEnabledSeed, string> = {
  territory: 'Territory map',
  contacts: 'Contacts',
  activities: 'Activity timeline',
  tasks: 'Tasks',
};

export default function OnboardingFlow() {
  const router = useRouter();
  const nameId = useId();
  const singularId = useId();
  const pluralId = useId();
  const ownerId = useId();

  const [step, setStep] = useState<'template' | 'customize'>('template');
  const [templateId, setTemplateId] = useState<SeedTemplateId>('sales');
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<WorkspaceSettingsSeed>(SEED_TEMPLATES.sales.settings);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(SEED_TEMPLATES[templateId].settings);
  }, [templateId]);

  const template = useMemo(() => SEED_TEMPLATES[templateId], [templateId]);

  function toggleModule(key: keyof ModulesEnabledSeed) {
    setSettings((s) => ({
      ...s,
      modules_enabled: { ...s.modules_enabled, [key]: !s.modules_enabled[key] },
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createWorkspace(name, templateId, settings);
      router.replace(settings.modules_enabled.territory ? '/territory' : '/accounts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Set up your workspace
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === 'template'
              ? 'Pick a starting template. You can change anything afterwards.'
              : `Customize your ${template.label} workspace.`}
          </p>
        </header>

        {step === 'template' && (
          <div className="space-y-3">
            {TEMPLATE_ORDER.map((id) => {
              const t = SEED_TEMPLATES[id];
              const active = id === templateId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTemplateId(id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t.settings.entity_noun_plural} · {t.settings.owner_noun}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{TEMPLATE_DESCRIPTIONS[id]}</p>
                </button>
              );
            })}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep('customize')}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'customize' && (
          <form
            onSubmit={onSubmit}
            className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Workspace name
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="Acme Inc."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={singularId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Record name (singular)
                </label>
                <input
                  id={singularId}
                  value={settings.entity_noun_singular}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, entity_noun_singular: e.target.value }))
                  }
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
                  value={settings.entity_noun_plural}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, entity_noun_plural: e.target.value }))
                  }
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
                value={settings.owner_noun}
                onChange={(e) => setSettings((s) => ({ ...s, owner_noun: e.target.value }))}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                Modules
              </legend>
              <div className="space-y-1.5">
                {(Object.keys(MODULE_LABELS) as Array<keyof ModulesEnabledSeed>).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={settings.modules_enabled[key]}
                      onChange={() => toggleModule(key)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    {MODULE_LABELS[key]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              Preview: a {settings.entity_noun_singular.toLowerCase()} owned by a{' '}
              {settings.owner_noun.toLowerCase()}; {settings.entity_noun_plural.toLowerCase()} list page
              under <code>/accounts</code>.
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setStep('template')}
                disabled={submitting}
                className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:hover:text-slate-300"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {submitting ? 'Creating…' : 'Create workspace'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
