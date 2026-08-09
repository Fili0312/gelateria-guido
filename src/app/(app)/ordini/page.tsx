import { OrderScreen } from '@/components/orders/order-screen';
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

  const repo = ordersRepository(user.organizationId);
  // Ordine **e** catalogo dal server: la schermata si apre già piena, senza il
  // lampo di elenco vuoto che si avrebbe caricandolo dal browser dopo il primo
  // disegno.
  const [ordine, catalogo] = await Promise.all([
    repo.corrente(user.id),
    repo.cerca(user.id, { limite: 500, soloConfrontabili: false }),
  ]);

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
          Il catalogo è già qui: premi <strong>+</strong> per aggiungere. L’ordine sta di fianco e
          resta dov’è anche se chiudi la pagina, e accanto a ogni prodotto c’è già scritto da chi
          conviene comprarlo.
        </p>
      </header>

      <OrderScreen
        ordineIniziale={ordine}
        catalogoIniziale={catalogo}
        endpointRicerca={withBasePath('/api/orders/current/search')}
        endpointOrdine={withBasePath('/api/orders/current')}
      />
    </div>
  );
}
