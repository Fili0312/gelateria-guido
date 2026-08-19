import { z } from 'zod';
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

const corpoSchema = z.object({ disponibile: z.boolean() }).strict();

/**
 * «Questo non ce l'ho»: il fornitore consegna e manca un articolo.
 *
 * Non modifica l'ordine — che è confermato e resta congelato — ma toglie
 * quella riga dai totali e dai documenti che si rigenerano. La riga resta in
 * elenco: lo storico deve poter dire cosa era stato ordinato.
 *
 * Lo stesso comando rimette la riga in ordine, perché la telefonata dopo
 * («l'ho trovato») è frequente quanto la prima.
 */
export async function POST(
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
      await ordersRepository(user.organizationId).segnaDisponibilita(id, lineId, corpo.disponibile),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile aggiornare la riga.', ERRORI_ORDINE);
  }
}
