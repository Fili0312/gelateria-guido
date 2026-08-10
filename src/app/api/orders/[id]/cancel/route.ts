import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../errori';

export const dynamic = 'force-dynamic';

/**
 * Annulla un ordine confermato.
 *
 * Non lo cancella: resta, con lo stato che dice cosa è successo. Un ordine
 * sparito lascia un buco nella numerazione e nessun modo di sapere se era
 * stato mandato.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    return jsonSuccess(await ordersRepository(user.organizationId).annulla(id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile annullare l’ordine.', ERRORI_ORDINE);
  }
}
