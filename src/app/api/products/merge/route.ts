import { z } from 'zod';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { unisciProdotti } from '@/server/catalog/merge';

export const dynamic = 'force-dynamic';

const corpoSchema = z.object({ primoId: z.string().min(1), secondoId: z.string().min(1) }).strict();

/** Unisce due prodotti: le offerte restano distinte, cambia solo a chi appartengono. */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const corpo = corpoSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    return jsonSuccess(await unisciProdotti(user.organizationId, corpo.primoId, corpo.secondoId));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile unire i prodotti.', [
      { nome: 'MergeError', status: 422 },
    ]);
  }
}
