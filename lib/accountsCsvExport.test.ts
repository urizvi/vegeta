import { describe, expect, it } from 'vitest';
import { buildAccountsCsv } from './accountsCsvExport';
import type { FieldDefinition } from './accountFields';
import type { Account } from '@/types/account';

describe('buildAccountsCsv', () => {
  it('marks computed columns with the ƒ prefix', () => {
    const defs: FieldDefinition[] = [
      { id: 'f_arr', label: 'ARR', type: 'metric', entity: 'account' },
      { id: 'f_t', label: 'Tier', type: 'computed', entity: 'account', outputType: 'text' },
    ];
    const accounts: Account[] = [
      { id: 'a', name: 'Acme', repId: null, stageId: null, fields: { f_arr: 100, f_t: 'SMB' } },
    ];
    const csv = buildAccountsCsv(accounts, defs);
    expect(csv.split('\n')[0]).toBe('Name,ARR,ƒ Tier');
    expect(csv.split('\n')[1]).toBe('Acme,100,SMB');
  });
  it('escapes commas and quotes', () => {
    const defs: FieldDefinition[] = [{ id: 'f_n', label: 'Notes', type: 'text', entity: 'account' }];
    const accounts: Account[] = [{ id: 'a', name: 'A, B "C"', repId: null, stageId: null, fields: { f_n: '' } }];
    const csv = buildAccountsCsv(accounts, defs);
    expect(csv.split('\n')[1]).toBe('"A, B ""C""",');
  });
});
