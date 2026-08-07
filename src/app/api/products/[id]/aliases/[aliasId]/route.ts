import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { productsRepository } from '@/server/repositories/products';
import { ERRORI_CATALOGO } from '../../../errori';

export const dynamic = 'force-dynamic';

type Contesto = { params: Promise<{ id: string; aliasId: string }> };

export async function DELETE(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id, aliasId } = await params;
    return jsonSuccess(await productsRepository(user.organizationId).removeAlias(id, aliasId));
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_CATALOGO);
  }
}
