import { describe, expect, it } from 'vitest';
import { assertGate, checkGate, type Gate } from './waferiqGates';

const ALL_GATES: Gate[] = ['export_csv', 'export_xlsx', 'agent_matcher', 'multi_workspace'];

describe('checkGate', () => {
  it('grants export_csv today', () => {
    expect(checkGate('export_csv').allowed).toBe(true);
  });
  it('grants export_xlsx today', () => {
    expect(checkGate('export_xlsx').allowed).toBe(true);
  });
  it('grants agent_matcher today', () => {
    expect(checkGate('agent_matcher').allowed).toBe(true);
  });
  it('grants multi_workspace today', () => {
    expect(checkGate('multi_workspace').allowed).toBe(true);
  });
});

describe('assertGate', () => {
  it('does not throw for allowed gates', () => {
    for (const g of ALL_GATES) {
      expect(() => assertGate(g)).not.toThrow();
    }
  });
});
