'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AppIcon, type AppIconName } from '@/components/app-icon';

const NAV_ITEMS: { href: string; label: string; icon: AppIconName }[] = [
  { href: '/', label: 'Panoramica', icon: 'home' },
  { href: '/fornitori', label: 'Fornitori', icon: 'suppliers' },
  { href: '/prodotti', label: 'Prodotti', icon: 'products' },
  { href: '/listini', label: 'Listini', icon: 'lists' },
  { href: '/ordini', label: 'Ordini', icon: 'orders' },
  { href: '/impostazioni', label: 'Impostazioni', icon: 'settings' },
];

const LABELS = new Map(NAV_ITEMS.map((item) => [item.href, item.label]));

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname.endsWith('/gelateria');
  return pathname === href || pathname.endsWith(href) || pathname.includes(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="group flex min-h-11 items-center gap-3 rounded-xl">
      <span className="bg-brand-600 shadow-brand-900/10 grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black tracking-tight text-white shadow-lg transition-transform group-hover:-rotate-2">
        GG
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-extrabold tracking-tight text-neutral-950">
          Gelateria Guido
        </span>
        <span className="block text-xs text-neutral-500">Listini e ordini</span>
      </span>
    </Link>
  );
}

function Navigation({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return (
    <nav
      aria-label="Navigazione principale"
      className={mobile ? 'flex min-w-max gap-1' : 'space-y-1'}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
              active
                ? 'bg-brand-50 text-brand-800'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'
            } ${mobile ? 'shrink-0' : ''}`}
          >
            <AppIcon
              name={item.icon}
              className={`h-5 w-5 shrink-0 ${active ? 'text-brand-600' : 'text-neutral-400 group-hover:text-neutral-600'}`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton({
  endpoint,
  loginPath,
  compact = false,
}: {
  endpoint: string;
  loginPath: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' } });
    } finally {
      router.replace(loginPath);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-60 ${
        compact ? 'w-11 px-0' : 'w-full px-3'
      }`}
      aria-label={compact ? 'Esci' : undefined}
    >
      <AppIcon name="logout" className="h-5 w-5" />
      {!compact && (loading ? 'Uscita…' : 'Esci')}
    </button>
  );
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const item = NAV_ITEMS.find((entry) => isActive(pathname, entry.href));
  const label = item?.label ?? LABELS.get('/') ?? 'Panoramica';

  return (
    <nav
      aria-label="Percorso"
      className="mb-5 flex items-center gap-1.5 text-xs font-medium text-neutral-500 sm:mb-7"
    >
      <span>Gelateria Guido</span>
      <AppIcon name="chevron" className="h-3.5 w-3.5 text-neutral-300" />
      <span className="text-neutral-800" aria-current="page">
        {label}
      </span>
    </nav>
  );
}

export function AppShell({
  children,
  logoutEndpoint,
  loginPath,
}: {
  children: ReactNode;
  logoutEndpoint: string;
  loginPath: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-neutral-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-neutral-200/80 bg-white px-5 py-6 lg:flex">
        <Brand />

        <div className="mt-9 flex-1">
          <p className="mb-2 px-3 text-[0.68rem] font-bold tracking-[0.16em] text-neutral-400 uppercase">
            Lavoro
          </p>
          <Navigation pathname={pathname} />
        </div>

        <div className="border-brand-100 bg-brand-50/70 mb-3 rounded-2xl border p-4">
          <div className="text-brand-700 flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
            <AppIcon name="shield" className="h-4 w-4" />
            Ambiente protetto
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-600">
            Fase 8 · Listini letti e interpretati, prima di toccare il catalogo.
          </p>
        </div>
        <LogoutButton endpoint={logoutEndpoint} loginPath={loginPath} />
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <Brand />
            <LogoutButton endpoint={logoutEndpoint} loginPath={loginPath} compact />
          </div>
          <div className="overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Navigation pathname={pathname} mobile />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[94rem] px-4 py-6 sm:px-7 sm:py-8 xl:px-10">
          <Breadcrumb pathname={pathname} />
          {children}
        </main>
      </div>
    </div>
  );
}
