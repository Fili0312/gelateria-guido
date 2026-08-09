import { rigaOrdineInputSchema } from '@/features/orders/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../errori';

export const dynamic = 'force-dynamic';

/**
 * Aggiunge un'offerta all'ordine.
 *
 * Aggiungere due volte la stessa offerta **non crea due righe**: la seconda
 * volta aumenta la quantità. È quello che si intende ricercando di nuovo lo
 * stesso articolo, ed è anche la rete contro il doppio invio — il vincolo di
 * unicità su (ordine, offerta) rende impossibile il doppione a livello di
 * database, non solo di interfaccia.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const input = rigaOrdineInputSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    return jsonSuccess(await ordersRepository(user.organizationId).aggiungiRiga(user.id, input));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile aggiungere la riga.', ERRORI_ORDINE);
  }
}
