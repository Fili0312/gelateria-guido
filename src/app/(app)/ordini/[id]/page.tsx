import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppIcon } from '@/components/app-icon';
import { OrderActions } from '@/components/orders/order-actions';
import { OrderDocuments } from '@/components/orders/order-documents';
import { OrderLines } from '@/components/orders/order-lines';
import { Badge } from '@/components/ui';
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
export default async function OrdineStoricoPage({ params }: { params: Promise<{ id: string }> }) {
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
            ? 'Ordine annullato. Viene conservato con il proprio numero: l’annullamento non comporta la cancellazione.'
            : 'Prezzi, confezioni e descrizioni sono quelli registrati alla conferma e non variano con le modifiche al catalogo.'}
        </span>
      </p>

      <OrderLines
        ordine={ordine}
        endpointOrdini={withBasePath('/api/orders')}
        modificabile={!annullato}
      />

      {ordine.note && (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
          <span className="font-semibold text-neutral-900">Nota:</span> {ordine.note}
        </p>
      )}

      <OrderDocuments
        orderId={ordine.id}
        iniziali={documenti}
        endpointOrdini={withBasePath('/api/orders')}
        generabile={!annullato}
      />

      <OrderActions
        orderId={ordine.id}
        codice={ordine.code}
        annullabile={!annullato}
        endpointOrdini={withBasePath('/api/orders')}
      />

      <p className="text-xs text-neutral-400">
        L’invio email dall’applicazione non è attivo: scaricare i documenti e allegarli manualmente.
      </p>
    </div>
  );
}
