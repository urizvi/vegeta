import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const entitled = { value: false };
vi.mock('@/hooks/useEntitlements', () => ({ useModuleEntitled: () => entitled.value }));

import ModuleGate from './ModuleGate';

describe('ModuleGate', () => {
  beforeEach(() => { replace.mockReset(); entitled.value = false; });

  it('renders children when entitled', () => {
    entitled.value = true;
    render(<ModuleGate moduleKey="tasks"><div>inside</div></ModuleGate>);
    expect(screen.getByText('inside')).toBeInTheDocument();
  });

  it('redirects to /upgrade when not entitled', () => {
    entitled.value = false;
    render(<ModuleGate moduleKey="tasks"><div>inside</div></ModuleGate>);
    expect(replace).toHaveBeenCalledWith('/upgrade?module=tasks');
    expect(screen.queryByText('inside')).not.toBeInTheDocument();
  });
});
