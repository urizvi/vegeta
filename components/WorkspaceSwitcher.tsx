'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setCurrentWorkspaceId,
  getMyWorkspaces,
  type Workspace,
} from '@/lib/workspace';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';

const NEW_VALUE = '__new__';

export default function WorkspaceSwitcher() {
  const router = useRouter();
  const currentId = useCurrentWorkspaceId();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [busy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyWorkspaces()
      .then((ws) => {
        if (!cancelled) setWorkspaces(ws);
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, busy]);

  if (workspaces.length === 0 && !currentId) return null;

  function handleChange(value: string) {
    if (value === NEW_VALUE) {
      router.push('/onboarding');
      return;
    }
    if (!value || value === currentId) return;
    setCurrentWorkspaceId(value).catch(() => {
      // Failure leaves the cached id unchanged; the select will snap back.
    });
  }

  return (
    <select
      value={currentId ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      disabled={busy}
      className="appearance-none rounded-md border border-hairline bg-panel/60 py-1.5 pl-2.5 pr-7 text-[11px] font-medium tracking-tight text-ink-body outline-none transition-colors hover:bg-panel hover:border-hairline-strong focus:border-brand/60 focus:ring-2 focus:ring-brand/20 disabled:opacity-50 [background-image:url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2210%22%20height=%2210%22%20viewBox=%220%200%2010%2010%22><path%20d=%22M2%204l3%203%203-3%22%20stroke=%22%2397a0b3%22%20stroke-width=%221.4%22%20fill=%22none%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/></svg>')] [background-position:right_0.5rem_center] [background-repeat:no-repeat] [background-size:10px_10px]"
      title="Switch workspace"
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
      <option disabled>──────────</option>
      <option value={NEW_VALUE}>+ New workspace…</option>
    </select>
  );
}
