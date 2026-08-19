import Link from 'next/link';
import { SupplierDetailShell } from '@/components/suppliers/supplier-detail-shell';
import { Badge } from '@/components/ui';
import { elencoOrdiniSchema } from '@/features/orders/schema';
import { euro } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { ordersRepository } from '@/server/repositories/orders';
import { loadSupplier } from '../supplier-page';

const STATO: Record<string, { testo: string; variante: 'success' | 'neutral' | 'warning' }> = {
  CONFIRMED: { testo: 'confermato', variante: 'success' },
  SENT: { testo: 'inviato', variante: 'success' },
  RECEIVED: { testo: 'ricevuto', variante: 'success' },
  CANCELLED: { testo: 'annullato', variante: 'neutral' },
};

export default async function SupplierOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [supplier, user] = await Promise.all([loadSupplier(id), getCurrentUser()]);
  if (!user) return null;

  const elenco = await ordersRepository(user.organizationId).elenco(
    elencoOrdiniSchema.parse({ supplierId: id, perPagina: 20 }),
  );

  return (
    <SupplierDetailShell
      supplier={supplier}
      activeTab="ordini"
      endpoint={withBasePath(`/api/suppliers/${supplier.id}`)}
    >
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-neutral-950">
              Ordini a {supplier.name}
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              {elenco.totale === 1
                ? 'Un ordine contiene prodotti di questo fornitore.'
                : `${elenco.totale} ordini contengono prodotti di questo fornitore.`}
            </p>
          </div>
          <Link
            href={`/ordini/storico?supplierId=${encodeURIComponent(id)}`}
            className="text-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 items-center rounded-lg text-sm font-bold hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Apri lo storico filtrato →
          </Link>
        </header>

        {elenco.items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm leading-6 text-neutral-500">
            Nessun ordine confermato contiene ancora prodotti di questo fornitore.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {elenco.items.map((ordine) => {
              const stato = STATO[ordine.status] ?? {
                testo: ordine.status.toLowerCase(),
                variante: 'neutral' as const,
              };
              const data = ordine.confirmedAt ?? ordine.createdAt;
              return (
                <li key={ordine.id}>
                  <Link
                    href={`/ordini/${ordine.id}`}
                    className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-neutral-50 sm:px-6"
                  >
                    <strong className="tabellare w-28 text-neutral-950">
                      {ordine.code ?? 'Senza codice'}
                    </strong>
                    <span className="w-28 text-sm text-neutral-600">
                      {new Date(data).toLocaleDateString('it-IT')}
                    </span>
                    <Badge variant={stato.variante}>{stato.testo}</Badge>
                    <span className="min-w-0 flex-1 text-sm text-neutral-500">
                      {ordine.righe} righe · {ordine.confezioni} confezioni
                    </span>
                    <span className="tabellare text-sm text-neutral-500">
                      totale ordine{' '}
                      <strong className="text-neutral-950">{euro(ordine.netto)}</strong>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </SupplierDetailShell>
  );
}
