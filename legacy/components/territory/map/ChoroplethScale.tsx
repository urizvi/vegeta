'use client';

import { useMapTheme } from '@/hooks/useTerritoryStore';
import { rampStops } from '@/lib/choropleth';
import { formatFieldValue } from '@/lib/accountFields';
import type { FieldDefinition } from '@/lib/accountFields';
import type { ChoroplethScale as Scale } from '@/lib/choropleth';

interface Props {
  scale: Scale;
  fieldDef: FieldDefinition;
}

export default function ChoroplethScale({ scale, fieldDef }: Props) {
  const theme = useMapTheme();
  const minLabel = formatFieldValue(scale.min, fieldDef);
  const maxLabel = formatFieldValue(scale.max, fieldDef);

  return (
    <div>
      <p className={theme.legendTitleClass}>{fieldDef.label}</p>
      <div
        className="h-3 w-full rounded-sm ring-1 ring-black/10"
        style={{ backgroundImage: `linear-gradient(to right, ${rampStops()})` }}
      />
      <div className={`mt-1 flex justify-between font-mono tabular-nums ${theme.legendTextClass}`}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}
