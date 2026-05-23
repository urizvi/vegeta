'use client';

import { clearWorkspaceCache } from '@/lib/workspace';

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Login failed');
  }
  notify();
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } finally {
    clearWorkspaceCache();
    notify();
  }
}

/** Ping Directus via the Next proxy; returns true if the session cookie is valid. */
export async function checkSession(): Promise<boolean> {
  const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
  return res.ok;
}
