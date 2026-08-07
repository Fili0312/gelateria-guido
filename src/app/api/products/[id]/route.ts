import { productPatchSchema } from '@/features/products/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { productsRepository } from '@/server/repositories/products';
import { ERRORI_CATALOGO } from '../errori';

export const dynamic = 'force-dynamic';

type Contesto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await params;
    const prodotto = await productsRepository(user.organizationId).get(id);
    if (!prodotto) return jsonError('Prodotto non trovato.', 404);
    return jsonSuccess(prodotto);
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_CATALOGO);
  }
}

export async function PATCH(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    const patch = productPatchSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    return jsonSuccess(await productsRepository(user.organizationId).update(id, patch));
  } catch (error) {
    return mappedErrorResponse(error, 'I dati del prodotto non sono validi.', ERRORI_CATALOGO);
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
    await productsRepository(user.organizationId).delete(id);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_CATALOGO);
  }
}
