import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppIcon } from '@/components/app-icon';
import { OrderActions } from '@/components/orders/order-actions';
import { OrderDocuments } from '@/components/orders/order-documents';
import { Badge } from '@/components/ui';
import { euro, formatoConfezione } from '@/features/products/format';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { orderDocumentsRepository } from '@/server/repositories/order-documents';
import { ordersRepository } from '@/server/repositories/orders';

export const dynamic = 'force-dynamic';

/**
 * Un ordine congelato.
 *
 * Legge **solo gli snapshot**: nessun dato di questa pagina viene dal catalogo
 * attuale. È la prova che il congelamento funziona — fra sei mesi deve
 * mostrare i prezzi di oggi anche se il prodotto è stato rinominato, il
 * fornitore cambiato e l'offerta cancellata.
 */
export default async function OrdineStoricoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const ordine = await ordersRepository(user.organizationId).storico(id);
  if (!ordine) notFound();

  const documenti = await orderDocumentsRepository(user.organizationId).elenco(id);

  const annullato = ordine.status === 'CANCELLED';
  const quando = ordine.confirmedAt ?? ordine.createdAt;

  return (
    <div className="space-y-5">
      <header>
        <Link href="/ordini/storico" className="text-sm text-neutral-500 hover:underline">
          ← Ordini fatti
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Ordine {ordine.code}
          </h1>
          <Badge variant={annullato ? 'neutral' : 'success'}>
            {annullato ? 'annullato' : 'confermato'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {new Date(quando).toLocaleString('it-IT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          · {ordine.perFornitore.reduce((n, g) => n + g.righe.length, 0)} righe ·{' '}
          {ordine.perFornitore.length}{' '}
          {ordine.perFornitore.length === 1 ? 'fornitore' : 'fornitori'}
          {annullato && ordine.cancelledAt && (
            <> · annullato il {new Date(ordine.cancelledAt).toLocaleDateString('it-IT')}</>
          )}
        </p>
      </header>

      <p
        className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm leading-6 ${
          annullato
            ? 'border-neutral-200 bg-neutral-50 text-neutral-600'
            : 'border-green-200 bg-green-50 text-green-900'
        }`}
      >
        <AppIcon name={annullato ? 'warning' : 'check'} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {annullato
            ? 'Ordine annullato. Resta qui col suo numero: annullarlo non lo cancella, e lo storico deve poter dire cosa è successo.'
            : 'Prezzi, confezioni e descrizioni sono quelli del momento della conferma e non cambieranno più, qualunque cosa succeda al catalogo.'}
        </span>
      </p>

      {ordine.perFornitore.map((gruppo) => (
        <section
          key={gruppo.supplierName}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
            <h2 className="font-black text-neutral-950">{gruppo.supplierName}</h2>
            <p className="tabellare text-sm text-neutral-600">
              {gruppo.righe.length} righe ·{' '}
              <strong className="text-neutral-950">{euro(gruppo.netto)}</strong>
            </p>
          </header>
          <ul className="divide-y divide-neutral-100">
            {gruppo.righe.map((riga) => (
              <li key={riga.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                <span className="tabellare w-10 shrink-0 font-bold text-neutral-950">
                  {riga.quantityPacks}×
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-neutral-950">{riga.name}</span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {formatoConfezione(riga.unitSize, riga.unitOfMeasure, riga.packQuantity)}
                    {riga.supplierCode && ` · cod. ${riga.supplierCode}`}
                  </span>
                  {riga.note && (
                    <span className="mt-0.5 block text-xs text-neutral-500">{riga.note}</span>
                  )}
                </span>
                <span className="tabellare text-xs text-neutral-500">{euro(riga.priceNet)}</span>
                <span className="tabellare w-20 text-right text-sm font-bold text-neutral-950">
                  {euro(riga.lineTotalNet)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {ordine.note && (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
          <span className="font-semibold text-neutral-900">Nota:</span> {ordine.note}
        </p>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-neutral-600">
            <dt>Netto</dt>
            <dd className="tabellare">{euro(ordine.netto)}</dd>
          </div>
          {Number(ordine.iva) > 0 && (
            <div className="flex justify-between text-neutral-600">
              <dt>IVA</dt>
              <dd className="tabellare">{euro(ordine.iva)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-neutral-100 pt-2">
            <dt className="font-semibold text-neutral-900">Totale</dt>
            <dd className="tabellare text-2xl font-black text-neutral-950">{euro(ordine.lordo)}</dd>
          </div>
        </dl>
      </section>

      <OrderDocuments
        orderId={ordine.id}
        iniziali={documenti}
        endpointOrdini={withBasePath('/api/orders')}
      />

      <OrderActions
        orderId={ordine.id}
        annullabile={!annullato}
        endpointOrdini={withBasePath('/api/orders')}
      />

      <p className="text-xs text-neutral-400">
        L’invio automatico ai fornitori via email arriva con la Fase 17: per ora i documenti si
        scaricano e si allegano a mano.
      </p>
    </div>
  );
}
