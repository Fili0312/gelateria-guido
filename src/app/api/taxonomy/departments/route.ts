import { departmentInputSchema, taxonomyQuerySchema } from '@/features/taxonomy/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { taxonomyRepository } from '@/server/repositories/taxonomy';
import { ERRORI_TASSONOMIA } from '../errori';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const repo = taxonomyRepository(user.organizationId);
    const input = departmentInputSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    const id = await repo.createDepartment(input);
    // Si risponde con l'albero intero e non con la sola riga creata: chi ha
    // chiamato deve ridisegnare i conteggi e l'ordine, e riceverli qui evita
    // il giro di andata e ritorno che li mostrerebbe per un istante vecchi.
    return jsonSuccess(
      { id, ...(await repo.tree(taxonomyQuerySchema.parse({ includiInattivi: 'true' }))) },
      201,
    );
  } catch (error) {
    return mappedErrorResponse(error, 'I dati del reparto non sono validi.', ERRORI_TASSONOMIA);
  }
}
