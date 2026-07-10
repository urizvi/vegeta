'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/ingest', label: 'Ingest' },
  { href: '/recon', label: 'Recon' },
];

// Routes where the top nav should be suppressed. Keep this list short:
// login, legacy pages that render their own chrome, etc.
const HIDDEN_PATHS = new Set(['/login']);

export default function AppNav() {
  const pathname = usePathname();
  if (pathname && HIDDEN_PATHS.has(pathname)) return null;

  return (
    <nav className="sticky top-0 z-10 flex items-center gap-4 border-b border-[var(--hairline)] bg-[var(--surface-panel)]/80 px-4 py-2 backdrop-blur">
      <Link
        href="/"
        className="mr-2 text-sm font-medium tracking-tight text-[color:var(--ink-strong)]"
      >
        WaferIQ
      </Link>
      <ul className="flex gap-1">
        {ITEMS.map((item) => {
          // Root is a special case — must match exactly, not prefix, else
          // "/" would highlight for every route.
          const active = item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded px-2.5 py-1 text-sm ${
                  active
                    ? 'bg-[var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : 'text-[color:var(--ink-body)] hover:bg-[var(--surface-sunken)]'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
