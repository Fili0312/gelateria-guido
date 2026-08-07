import { departmentPatchSchema } from '@/features/taxonomy/schema';
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
    const patch = departmentPatchSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    await taxonomyRepository(user.organizationId).updateDepartment(id, patch);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'I dati del reparto non sono validi.', ERRORI_TASSONOMIA);
  }
}

export async function DELETE(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    await taxonomyRepository(user.organizationId).deleteDepartment(id);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_TASSONOMIA);
  }
}
