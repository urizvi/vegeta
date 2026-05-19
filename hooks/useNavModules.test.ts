import { describe, expect, it } from 'vitest';
import { visibleModules } from './useNavModules';

describe('visibleModules', () => {
  it('hides a module that is not entitled even if enabled', () => {
    const out = visibleModules({ tasks: false, territory: true }, { tasks: true, territory: true });
    expect(out.map((m) => m.key)).toEqual(['territory']);
  });
  it('hides an entitled module that is disabled via modulesEnabled', () => {
    const out = visibleModules({ tasks: true, territory: true }, { tasks: false, territory: true });
    expect(out.map((m) => m.key)).toEqual(['territory']);
  });
  it('shows a module only when entitled AND enabled', () => {
    const out = visibleModules({ tasks: true, territory: true }, { tasks: true, territory: true });
    expect(out.map((m) => m.key).sort()).toEqual(['tasks', 'territory']);
  });
});
