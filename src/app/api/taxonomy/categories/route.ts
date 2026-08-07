import { categoryInputSchema } from '@/features/taxonomy/schema';
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

    const input = categoryInputSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    const id = await taxonomyRepository(user.organizationId).createCategory(input);
    return jsonSuccess({ id }, 201);
  } catch (error) {
    return mappedErrorResponse(error, 'I dati della categoria non sono validi.', ERRORI_TASSONOMIA);
  }
}
