import { rigaOrdinePatchSchema } from '@/features/orders/schema';
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

/** Cambia la quantità o la nota di una riga. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    const patch = rigaOrdinePatchSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    return jsonSuccess(
      await ordersRepository(user.organizationId).aggiornaRiga(user.id, id, patch),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile modificare la riga.', ERRORI_ORDINE);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    return jsonSuccess(await ordersRepository(user.organizationId).rimuoviRiga(user.id, id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile togliere la riga.', ERRORI_ORDINE);
  }
}
