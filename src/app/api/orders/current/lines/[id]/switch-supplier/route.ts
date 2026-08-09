import { cambioFornitoreSchema } from '@/features/orders/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../../../errori';

export const dynamic = 'force-dynamic';

/**
 * Passa una riga al fornitore più conveniente.
 *
 * Le confezioni si ricalcolano: quattro colli da 12 diventano due da 24, e il
 * conto è lo stesso che l'avviso ha mostrato prima di far premere. Quando la
 * quantità non torna esatta, l'avviso lo aveva già dichiarato — qui non si
 * arrotonda niente di nascosto.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    const corpo = cambioFornitoreSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    return jsonSuccess(
      await ordersRepository(user.organizationId).cambiaFornitore(
        user.id,
        id,
        corpo.supplierProductId,
      ),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile cambiare fornitore.', ERRORI_ORDINE);
  }
}
