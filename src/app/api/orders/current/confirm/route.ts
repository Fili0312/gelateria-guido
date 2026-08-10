import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../errori';

export const dynamic = 'force-dynamic';

/**
 * Congela l'ordine: snapshot ai prezzi di adesso, codice progressivo,
 * `CONFIRMED`.
 *
 * **Idempotente.** Un secondo invio trova l'ordine già confermato e
 * restituisce lo stesso codice, senza toccare niente e senza errore: un
 * errore farebbe pensare che il primo non abbia funzionato, e la reazione
 * naturale sarebbe premere ancora.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }
    return jsonSuccess(await ordersRepository(user.organizationId).conferma(user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile confermare l’ordine.', ERRORI_ORDINE);
  }
}
