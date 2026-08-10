import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../errori';

export const dynamic = 'force-dynamic';

/**
 * Rimette un ordine vecchio nella bozza, **ai prezzi di oggi**.
 *
 * Riordinare a prezzi vecchi darebbe una bozza che cambia totale alla
 * conferma, e la conferma è dove non si vogliono sorprese. Ciò che non si può
 * rimettere si dice articolo per articolo: un riordino che salta tre righe in
 * silenzio è peggio di uno che fallisce, perché la mancanza si scopre alla
 * consegna.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    return jsonSuccess(await ordersRepository(user.organizationId).riordina(user.id, id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile riordinare.', ERRORI_ORDINE);
  }
}
