'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useModuleEntitled } from '@/hooks/useEntitlements';
import type { ModuleKey } from '@/lib/entitlements';

/**
 * Client access gate. Renders children only when the workspace is entitled to
 * `moduleKey`; otherwise redirects to the upgrade page. Server Directus
 * policies are the authoritative gate — this is the UX layer.
 */
export default function ModuleGate({
  moduleKey,
  children,
}: {
  moduleKey: ModuleKey;
  children: React.ReactNode;
}) {
  const entitled = useModuleEntitled(moduleKey);
  const router = useRouter();

  useEffect(() => {
    if (!entitled) router.replace(`/upgrade?module=${moduleKey}`);
  }, [entitled, moduleKey, router]);

  if (!entitled) return null;
  return <>{children}</>;
}
