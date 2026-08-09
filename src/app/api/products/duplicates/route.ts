import { z } from 'zod';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { cercaDoppioni } from '@/server/catalog/duplicates';

export const dynamic = 'force-dynamic';

const corpoSchema = z.object({ usaModello: z.boolean().default(true) }).strict();

/**
 * Cerca lo stesso articolo venduto da due fornitori.
 *
 * Non cambia niente: **propone**. Le coppie che trova vanno confermate una a
 * una, perché fondere due prodotti che non c'entrano è un errore che si
 * scopre tardi e si disfa a mano.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const corpo = corpoSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    return jsonSuccess(await cercaDoppioni(user.organizationId, corpo));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile cercare i doppioni.', [
      { nome: 'AiBudgetError', status: 402 },
      { nome: 'AiError', status: 502 },
    ]);
  }
}
