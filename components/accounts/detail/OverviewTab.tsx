'use client';

import type { Account } from '@/types/account';
import type { FieldDefinition } from '@/lib/accountFields';
import { formatFieldValue } from '@/lib/accountFields';

export default function OverviewTab({
  account,
  fieldDefs,
}: {
  account: Account;
  fieldDefs: FieldDefinition[];
}) {
  const accountDefs = fieldDefs.filter((d) => d.entity === 'account');

  return (
    <div className="max-w-3xl space-y-6">
      <Section title="Identity">
        <Row label="Name" value={account.name} />
        <Row label="Country" value={account.country ?? '—'} />
        <Row
          label="State"
          value={account.state ? account.state.split(':')[1] ?? '—' : '—'}
        />
      </Section>

      <Section title="Custom fields">
        {accountDefs.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No custom fields configured for this entity.
          </p>
        ) : (
          accountDefs.map((def) => (
            <Row
              key={def.id}
              label={
                <span className="inline-flex items-center gap-1">
                  {def.label}
                  {def.type === 'computed' && (
                    <span
                      title="Computed field"
                      className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    >
                      ƒ
                    </span>
                  )}
                </span>
              }
              value={formatFieldValue(account.fields[def.id], def)}
            />
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 px-4 py-2.5 text-xs">
      <div className="col-span-1 text-slate-500 dark:text-slate-400">{label}</div>
      <div className="col-span-2 text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  );
}
