import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../errori';

export const dynamic = 'force-dynamic';

/**
 * L'ordine in corso di questo utente, creato se non c'è.
 *
 * Una `GET` che può creare non è ortodossa, ma l'alternativa — un pulsante
 * «inizia un ordine» — aggiunge un passo a una schermata che deve essere
 * pronta all'apertura. La bozza vuota non costa nulla e non è visibile da
 * nessuna parte finché non ha righe.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    return jsonSuccess(await ordersRepository(user.organizationId).corrente(user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere l’ordine.', ERRORI_ORDINE);
  }
}

/** Svuota l'ordine senza cancellarlo: la bozza resta, le righe no. */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }
    return jsonSuccess(await ordersRepository(user.organizationId).svuota(user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile svuotare l’ordine.', ERRORI_ORDINE);
  }
}
