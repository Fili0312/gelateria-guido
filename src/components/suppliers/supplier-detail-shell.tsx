import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import type { SupplierDetail } from '@/features/suppliers/dto';
import { supplierInitials } from '@/features/suppliers/format';
import { SupplierActions } from './supplier-actions';

export type SupplierTab = 'anagrafica' | 'listini' | 'prodotti' | 'prezzi' | 'ordini';

const TABS: Array<{ id: SupplierTab; label: string; suffix: string }> = [
  { id: 'anagrafica', label: 'Anagrafica', suffix: '' },
  { id: 'listini', label: 'Listini', suffix: '/listini' },
  { id: 'prodotti', label: 'Prodotti', suffix: '/prodotti' },
  { id: 'prezzi', label: 'Prezzi', suffix: '/prezzi' },
  { id: 'ordini', label: 'Ordini', suffix: '/ordini' },
];

const DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function SupplierDetailShell({
  supplier,
  activeTab,
  endpoint,
  children,
}: {
  supplier: SupplierDetail;
  activeTab: SupplierTab;
  endpoint: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <Link
        href="/fornitori"
        className="text-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 items-center rounded-lg text-sm font-bold hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        ← Torna ai fornitori
      </Link>

      <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <span className="bg-brand-50 text-brand-700 grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-black">
              {supplierInitials(supplier.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={supplier.active ? 'success' : 'neutral'} dot>
                  {supplier.active ? 'Attivo' : 'Inattivo'}
                </Badge>
                {supplier.code && <Badge variant="neutral">Codice {supplier.code}</Badge>}
              </div>
              <h1 className="mt-3 break-words text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
                {supplier.name}
              </h1>
              <p className="mt-2 text-sm text-neutral-500">
                Aggiornato il {DATE_FORMAT.format(new Date(supplier.updatedAt))}
              </p>
              <Link
                href={`/fornitori/${supplier.id}/modifica`}
                className="text-brand-700 focus-visible:ring-brand-600 mt-3 inline-flex min-h-11 items-center rounded-lg text-sm font-bold hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Modifica anagrafica
              </Link>
            </div>
          </div>

          <SupplierActions supplier={supplier} endpoint={endpoint} />
        </div>
      </header>

      <nav aria-label="Sezioni del fornitore" className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm sm:min-w-0">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={`/fornitori/${supplier.id}${tab.suffix}`}
                aria-current={active ? 'page' : undefined}
                className={`focus-visible:ring-brand-600 inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm font-bold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                  active
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </div>
  );
}
