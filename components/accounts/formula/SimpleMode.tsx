'use client';

import type { FieldDefinition, ComputedOutput } from '@/lib/accountFields';
import type { SimpleFormConfig } from '@/lib/formula/simpleForm';
import ArithmeticShape from './shapes/ArithmeticShape';
import BucketShape from './shapes/BucketShape';
import FlagShape from './shapes/FlagShape';

interface Props {
  config: SimpleFormConfig;
  outputType: ComputedOutput;
  defs: FieldDefinition[];
  onChange: (cfg: SimpleFormConfig) => void;
  tooComplex: boolean;
}

export default function SimpleMode({ config, defs, onChange, tooComplex }: Props) {
  if (tooComplex) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        This formula is too complex for Simple mode. Switch to Advanced to edit it.
      </div>
    );
  }
  if (config.shape === 'arithmetic') {
    return <ArithmeticShape config={config} defs={defs} onChange={(c: SimpleFormConfig) => onChange(c)} />;
  }
  if (config.shape === 'bucket') {
    return <BucketShape config={config} defs={defs} onChange={(c: SimpleFormConfig) => onChange(c)} />;
  }
  return <FlagShape config={config} defs={defs} onChange={(c: SimpleFormConfig) => onChange(c)} />;
}
