'use client';

import Link from 'next/link';
import {
  useFocusedEntityIso,
  useMapTheme,
} from '@/store/slices/mapUiSelectors';
import { useRegionRollup } from '@/store/slices/mapUiSelectors';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useOwnerNoun } from '@/hooks/useOwnerNoun';
import { formatFieldValue } from '@/lib/accountFields';

interface Props {
  /** Override the iso to summarize. Defaults to `useFocusedEntityIso()` (pin-or-hover). */
  iso?: string | null;
}

export default function RegionSummaryPanel({ iso: isoProp }: Props = {}) {
  const focusedIso = useFocusedEntityIso();
  const iso = isoProp !== undefined ? isoProp : focusedIso;
  const rollup = useRegionRollup(iso);
  // useEntityNoun(form) returns a plain string; useOwnerNoun() returns a plain string.
  const entityPlural = useEntityNoun('plural');
  const ownerNoun = useOwnerNoun();
  const theme = useMapTheme();

  if (!iso || !rollup) return null;

  const isState = iso.includes(':');
  const filterParam = isState ? `state:${iso}` : `country:${iso}`;
  const accountsHref = `/accounts?filter=${encodeURIComponent(filterParam)}`;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className={`${theme.legendTitleClass} truncate`}>{rollup.name}</p>
        {rollup.geoTrail.length > 0 ? (
          <p className={`${theme.legendTextClass} opacity-70 truncate`}>
            {rollup.geoTrail.join(' › ')}
          </p>
        ) : (
          <p className={`${theme.legendTextClass} opacity-60`}>Unassigned</p>
        )}
      </div>

      <p className={theme.legendTextClass}>
        <span className="font-medium">{rollup.count}</span> {entityPlural}
      </p>

      {rollup.topMetricTotals.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {rollup.topMetricTotals.map((m) => (
            <div key={m.fieldId} className={`${theme.legendTextClass} flex justify-between gap-2`}>
              <span className="truncate opacity-80">{m.label}</span>
              <span className="font-mono tabular-nums">{formatFieldValue(m.total, m.field)}</span>
            </div>
          ))}
        </div>
      )}

      {rollup.topOwners.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className={`${theme.legendTextClass} opacity-70`}>Top {ownerNoun}s</p>
          {rollup.topOwners.map((o) => (
            <div key={o.repId} className={`${theme.legendTextClass} flex items-center gap-1.5`}>
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: o.teamColor ?? '#94a3b8' }}
              />
              <span className="truncate flex-1">{o.name}</span>
              <span className="font-mono tabular-nums opacity-70">{o.count}</span>
            </div>
          ))}
        </div>
      )}

      <Link href={accountsHref} className={`${theme.legendTextClass} text-brand hover:underline`}>
        → {entityPlural} in this region
      </Link>
    </div>
  );
}
