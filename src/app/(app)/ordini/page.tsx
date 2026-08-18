import { OrderScreen } from '@/components/orders/order-screen';
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
    // Niente titolo grande e niente paragrafo di spiegazione.
    //
    // Su un telefono occupavano metà della prima schermata per dire cose che
    // si capiscono guardando: che questa è la pagina degli ordini lo dice la
    // voce di menu da cui si è arrivati, e che si preme «+» per aggiungere lo
    // dice il bottone verde. Al loro posto ci stanno due prodotti, che sono
    // il motivo per cui si è aperta la pagina.
    <div>
      <h1 className="sr-only">Ordini</h1>

      <OrderScreen
        ordineIniziale={ordine}
        catalogoIniziale={catalogo}
        endpointRicerca={withBasePath('/api/orders/current/search')}
        endpointOrdine={withBasePath('/api/orders/current')}
      />
    </div>
  );
}
