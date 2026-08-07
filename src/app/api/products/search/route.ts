import { productSearchQuerySchema } from '@/features/products/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { productsRepository } from '@/server/repositories/products';
import { ERRORI_CATALOGO } from '../errori';

export const dynamic = 'force-dynamic';

/**
 * La ricerca della barra. E' l'endpoint che nella Fase 12 verra' chiamato a
 * ogni tasto premuto, quindi risponde anche col tempo impiegato: il criterio
 * della fase e' un numero, e deve poter essere misurato dall'esterno invece
 * che dedotto.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    const query = productSearchQuerySchema.parse(rawQuery);
    return jsonSuccess(await productsRepository(user.organizationId).search(query));
  } catch (error) {
    return mappedErrorResponse(error, 'La ricerca non e valida.', ERRORI_CATALOGO);
  }
}
