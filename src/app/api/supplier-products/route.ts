import {
  supplierProductInputSchema,
  supplierProductListQuerySchema,
} from '@/features/products/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { supplierProductsRepository } from '@/server/repositories/supplier-products';
import { ERRORI_CATALOGO } from '../products/errori';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    const query = supplierProductListQuerySchema.parse(rawQuery);
    return jsonSuccess(await supplierProductsRepository(user.organizationId).list(query));
  } catch (error) {
    return mappedErrorResponse(error, 'I filtri richiesti non sono validi.', ERRORI_CATALOGO);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const input = supplierProductInputSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    const offerta = await supplierProductsRepository(user.organizationId).create(input);
    return jsonSuccess(offerta, 201);
  } catch (error) {
    return mappedErrorResponse(error, 'I dati dell offerta non sono validi.', ERRORI_CATALOGO);
  }
}
