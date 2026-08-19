import { z } from 'zod';
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

const corpoSchema = z
  .object({
    supplierProductId: z.string().trim().min(1).max(64),
    quantityPacks: z.coerce.number().int().min(1).max(9_999),
  })
  .strict();

/**
 * Aggiunge un articolo a un ordine già confermato.
 *
 * Fra la conferma e la consegna ci si accorge di aver dimenticato una cassa.
 * Finora l'unica via era un secondo ordine con un secondo numero per una riga
 * sola, e il fornitore si ritrovava due documenti per la stessa consegna.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const corpo = corpoSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    const { id } = await context.params;

    return jsonSuccess(
      await ordersRepository(user.organizationId).aggiungiRigaAOrdine(
        id,
        corpo.supplierProductId,
        corpo.quantityPacks,
      ),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile aggiungere la riga.', ERRORI_ORDINE);
  }
}
