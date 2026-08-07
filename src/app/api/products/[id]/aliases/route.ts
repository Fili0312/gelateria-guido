import { aliasInputSchema } from '@/features/products/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { productsRepository } from '@/server/repositories/products';
import { ERRORI_CATALOGO } from '../../errori';

export const dynamic = 'force-dynamic';

type Contesto = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    const input = aliasInputSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    return jsonSuccess(await productsRepository(user.organizationId).addAlias(id, input), 201);
  } catch (error) {
    return mappedErrorResponse(error, 'Il sinonimo non e valido.', ERRORI_CATALOGO);
  }
}
