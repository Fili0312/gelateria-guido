import { OrderBuilder } from '@/components/orders/order-builder';
import { Badge } from '@/components/ui';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { ordersRepository } from '@/server/repositories/orders';

export const dynamic = 'force-dynamic';

/**
 * La schermata d'ordine.
 *
 * L'ordine in corso si legge **sul server** e si passa già pronto: aprendo la
 * pagina si vede subito la spesa di ieri sera, senza il lampo di barra vuota
 * che si avrebbe caricandolo dal browser dopo il primo disegno. È la
 * differenza fra «l'ordine c'è» e «l'ordine è comparso».
 */
export default async function OrdiniPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const ordine = await ordersRepository(user.organizationId).corrente(user.id);

  return (
    <div className="space-y-5">
      <header>
        <Badge variant="brand" dot>
          Ordine in corso
        </Badge>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Ordini
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Cerca, aggiungi, vai avanti. L’ordine resta dov’è anche se chiudi la pagina o passi a un
          altro dispositivo, e accanto a ogni prodotto c’è già scritto{' '}
          <strong>da chi conviene comprarlo</strong>.
        </p>
      </header>

      <OrderBuilder
        ordineIniziale={ordine}
        endpointRicerca={withBasePath('/api/orders/current/search')}
        endpointOrdine={withBasePath('/api/orders/current')}
      />
    </div>
  );
}
