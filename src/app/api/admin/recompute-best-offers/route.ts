import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { ricalcolaMiglioriOfferte } from '@/server/import/best-offer';

export const dynamic = 'force-dynamic';

/**
 * Ricalcolo completo di `product_best_offer`.
 *
 * Serve dopo una correzione manuale dei prezzi o della confezione: quelle non
 * passano dall'import, quindi nulla ricalcolerebbe il dato derivato. Senza
 * questo comando l'unico modo di rimetterlo in pari sarebbe rifare un import,
 * cioè toccare i prezzi per aggiustare una tabella di appoggio.
 *
 * È un `POST` benché non prenda parametri: scrive.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    return jsonSuccess(await ricalcolaMiglioriOfferte(user.organizationId));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile ricalcolare le migliori offerte.', []);
  }
}
