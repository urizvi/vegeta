import { describe, expect, it } from 'vitest';
import { shouldFetch } from './hydrationPlan';

describe('shouldFetch', () => {
  const ents = (tasks: boolean, territory: boolean) => ({ tasks, territory });
  it('always fetches Core collections', () => {
    expect(shouldFetch('accounts', ents(false, false))).toBe(true);
    expect(shouldFetch('members', ents(false, false))).toBe(true);
  });
  it('gates tasks on the tasks entitlement', () => {
    expect(shouldFetch('tasks', ents(false, true))).toBe(false);
    expect(shouldFetch('tasks', ents(true, false))).toBe(true);
  });
  it('gates geo/teams on the territory entitlement', () => {
    expect(shouldFetch('geo_nodes', ents(true, false))).toBe(false);
    expect(shouldFetch('teams', ents(true, true))).toBe(true);
  });
});
