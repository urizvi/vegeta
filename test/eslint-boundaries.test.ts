import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

async function lintAs(file: string, code: string) {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(code, { filePath: file });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('module boundary lint rule', () => {
  it('forbids Tasks importing Territory internals', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/tasks/Foo.tsx`,
      `import { x } from '@/store/slices/geoSlice';\nexport const y = 1;\n`,
    );
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('allows Tasks importing the Core member slice', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/tasks/Foo.tsx`,
      `import { x } from '@/store/slices/membersSlice';\nexport const y = 1;\n`,
    );
    expect(msgs).toEqual([]);
  });

  it('forbids Territory importing Tasks internal (tasksSlice)', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/territory/Foo.tsx`,
      `import { x } from '@/store/slices/tasksSlice';\nexport const y = 1;\n`,
    );
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('forbids Territory importing Tasks internal (tasksSelectors)', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/territory/Foo.tsx`,
      `import { x } from '@/store/slices/tasksSelectors';\nexport const y = 1;\n`,
    );
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('forbids Core importing Tasks internal (tasksSelectors)', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/accounts/Foo.tsx`,
      `import { x } from '@/store/slices/tasksSelectors';\nexport const y = 1;\n`,
    );
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('forbids Core importing Territory internal (geoSlice)', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/accounts/Foo.tsx`,
      `import { x } from '@/store/slices/geoSlice';\nexport const y = 1;\n`,
    );
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('allows Tasks importing the combined territoryStore (escape hatch)', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/tasks/Foo.tsx`,
      `import { useTerritoryStore } from '@/store/territoryStore';\nexport const y = 1;\n`,
    );
    expect(msgs).toEqual([]);
  });
});
