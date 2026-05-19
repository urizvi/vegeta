import { describe, expect, it } from 'vitest';
import { MODULE_MANIFEST, addOnRoutes, moduleForPath } from './manifest';

describe('MODULE_MANIFEST', () => {
  it('declares tasks and territory add-ons', () => {
    expect(MODULE_MANIFEST.map((m) => m.key).sort()).toEqual(['tasks', 'territory']);
  });
  it('territory owns /territory and /teams', () => {
    const terr = MODULE_MANIFEST.find((m) => m.key === 'territory')!;
    expect(terr.routePrefixes).toEqual(['/territory', '/teams']);
  });
  it('addOnRoutes flattens every gated prefix', () => {
    expect(addOnRoutes().sort()).toEqual(['/tasks', '/teams', '/territory']);
  });
});

describe('moduleForPath', () => {
  it("'/tasks' → 'tasks' (exact match)", () => {
    expect(moduleForPath('/tasks')).toBe('tasks');
  });
  it("'/tasks/123' → 'tasks' (sub-path)", () => {
    expect(moduleForPath('/tasks/123')).toBe('tasks');
  });
  it("'/tasksfoo' → null (false-positive guard — must NOT match /tasks)", () => {
    expect(moduleForPath('/tasksfoo')).toBeNull();
  });
  it("'/accounts' → null (ungated Core path)", () => {
    expect(moduleForPath('/accounts')).toBeNull();
  });
  it("'/teams' → 'territory' (multi-prefix module)", () => {
    expect(moduleForPath('/teams')).toBe('territory');
  });
  it("'/territory/abc' → 'territory' (sub-path of second prefix)", () => {
    expect(moduleForPath('/territory/abc')).toBe('territory');
  });
});
