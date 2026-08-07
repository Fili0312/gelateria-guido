import { categoryPatchSchema } from '@/features/taxonomy/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { taxonomyRepository } from '@/server/repositories/taxonomy';
import { ERRORI_TASSONOMIA } from '../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    const patch = categoryPatchSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    await taxonomyRepository(user.organizationId).updateCategory(id, patch);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'I dati della categoria non sono validi.', ERRORI_TASSONOMIA);
  }
}

/**
 * Cancellare una categoria non cancella i prodotti: tornano «da
 * classificare». Quanti sono lo dice la risposta, perche' l'interfaccia
 * possa dirlo a sua volta invece di lasciarlo scoprire.
 */
export async function DELETE(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    const esito = await taxonomyRepository(user.organizationId).deleteCategory(id);
    return jsonSuccess({ id, ...esito });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_TASSONOMIA);
  }
}
