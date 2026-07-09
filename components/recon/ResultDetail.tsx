'use client';

import type { Claim, POSRecord, ReconciliationResult } from '@/domain/pos-recon/entities';
import { FLAG_LABEL } from '@/lib/reconView';

interface Props {
  result: ReconciliationResult;
  pos: POSRecord | undefined;
  claims: Claim[];
}

export default function ResultDetail({ result, pos, claims }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 border-t border-[var(--hairline)] bg-[var(--surface-sunken)] p-4 lg:grid-cols-2">
      <section>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
          POS record
        </h4>
        {pos ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <Field label="Distributor" value={pos.distributor} />
            <Field label="Period" value={pos.period} />
            <Field label="Part" value={pos.partNumber} mono />
            <Field label="Customer" value={pos.endCustomer} />
            <Field label="Ship date" value={pos.shipDate} />
            <Field label="Sell date" value={pos.sellDate} />
            <Field label="Quantity" value={String(pos.quantity)} mono />
            <Field label="Resale price" value={formatMoney(pos.resalePrice, pos.currency)} mono />
            <Field label="Extended amt" value={formatMoney(pos.extendedAmount, pos.currency)} mono />
          </dl>
        ) : (
          <p className="text-xs italic text-[color:var(--ink-muted)]">No POS record for this result (orphan claim).</p>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
          Claims ({claims.length})
        </h4>
        {claims.length === 0 ? (
          <p className="text-xs italic text-[color:var(--ink-muted)]">No claims linked (missing claim).</p>
        ) : (
          <ul className="space-y-2">
            {claims.map((c) => <ClaimBlock key={c.id} claim={c} />)}
          </ul>
        )}
      </section>

      {result.flags.length > 0 && (
        <section className="lg:col-span-2">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
            Flags
          </h4>
          <ul className="space-y-1 text-xs">
            {result.flags.map((f, i) => (
              <li key={i} className={severityClass(f.severity)}>
                <span className="font-mono">[{FLAG_LABEL[f.kind]}]</span> {f.message}
                {typeof f.amountImpact === 'number' && (
                  <span className="ml-2 font-mono text-[color:var(--ink-muted)]">
                    ({formatMoney(f.amountImpact, 'USD')})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ClaimBlock({ claim }: { claim: Claim }) {
  return (
    <li className="rounded border border-[var(--hairline)] bg-white p-2 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] uppercase">
          {claim.type === 'ship_and_debit' ? 'S&D' : 'PP'}
        </span>
        <span className="font-mono text-[color:var(--ink-muted)]">{claim.id}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Field label="Quantity" value={String(claim.quantity)} mono />
        <Field label="Period" value={claim.period} />
        {claim.type === 'ship_and_debit' ? (
          <>
            <Field label="Cost" value={formatMoney(claim.costPrice, claim.currency)} mono />
            <Field label="Authorized" value={formatMoney(claim.authorizedPrice, claim.currency)} mono />
          </>
        ) : (
          <>
            <Field label="Original" value={formatMoney(claim.originalPrice, claim.currency)} mono />
            <Field label="New" value={formatMoney(claim.newPrice, claim.currency)} mono />
            <Field label="Effective" value={claim.effectiveDate} />
          </>
        )}
      </dl>
    </li>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[color:var(--ink-muted)]">{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value}</dd>
    </>
  );
}

function severityClass(sev: 'info' | 'warning' | 'error'): string {
  if (sev === 'error') return 'text-rose-800';
  if (sev === 'warning') return 'text-amber-800';
  return 'text-[color:var(--ink-body)]';
}

function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
