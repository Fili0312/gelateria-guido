import { z } from 'zod';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../../errori';

export const dynamic = 'force-dynamic';

const corpoSchema = z.object({ quantityPacks: z.coerce.number().int().min(0).max(9_999) }).strict();

/**
 * Cambia le confezioni di una riga di un ordine confermato.
 *
 * Zero la toglie del tutto: è una nostra correzione, non una mancata
 * consegna. Per quella c'è «non disponibile», che la lascia in elenco.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; lineId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const corpo = corpoSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    const { id, lineId } = await context.params;

    return jsonSuccess(
      await ordersRepository(user.organizationId).cambiaQuantitaOrdine(
        id,
        lineId,
        corpo.quantityPacks,
      ),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile aggiornare la riga.', ERRORI_ORDINE);
  }
}
