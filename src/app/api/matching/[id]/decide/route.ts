import { decisioneSchema } from '@/features/matching/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { matchingRepository } from '@/server/repositories/matching';
import { ERRORI_ABBINAMENTO } from '../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * Registra una decisione su una riga.
 *
 * Confermare scrive un sinonimo, rifiutare ne scrive uno negativo: e' il
 * meccanismo per cui la revisione diventa un investimento decrescente invece
 * che un costo che si ripete a ogni listino.
 */
export async function POST(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    const decisione = decisioneSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    await matchingRepository(user.organizationId).decidi(id, decisione, user.id);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'La decisione non e valida.', ERRORI_ABBINAMENTO);
  }
}
