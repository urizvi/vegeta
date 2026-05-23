'use client';

import { useEffect, useState } from 'react';
import { checkSession, subscribe } from '@/lib/auth';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

export function useAuth(): { status: Status } {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      checkSession().then((ok) => {
        if (cancelled) return;
        setStatus(ok ? 'authenticated' : 'unauthenticated');
      });
    };
    run();
    const unsub = subscribe(run);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { status };
}
