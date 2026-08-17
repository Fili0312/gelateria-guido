import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../errori';

export const dynamic = 'force-dynamic';

/** Un ordine congelato, letto **solo dagli snapshot**. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await context.params;
    const ordine = await ordersRepository(user.organizationId).storico(id);
    if (!ordine) return jsonError('Ordine non trovato.', 404);
    return jsonSuccess(ordine);
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere l’ordine.', ERRORI_ORDINE);
  }
}

/**
 * Cancella un ordine confermato per sbaglio.
 *
 * Non è l'annullamento: quello lascia l'ordine nello storico col suo numero,
 * ed è la cosa giusta per un ordine vero che non si fa più. Questo lo toglie
 * di mezzo, documenti compresi — e libera il numero, che il prossimo ordine
 * si riprenderà.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    return jsonSuccess(await ordersRepository(user.organizationId).elimina(id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile eliminare l’ordine.', ERRORI_ORDINE);
  }
}
