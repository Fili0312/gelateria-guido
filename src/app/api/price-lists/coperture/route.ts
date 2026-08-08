import { coverageQuerySchema } from '@/features/price-lists/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { priceListsRepository } from '@/server/repositories/price-lists';
import { ERRORI_LISTINI } from '../errori';

export const dynamic = 'force-dynamic';

/**
 * Le coperture gia' usate da un fornitore.
 *
 * Serve a rispondere PRIMA del caricamento alla domanda «cosa sto per
 * sostituire». Mostrarlo dopo che l'import e' partito significa mostrarlo
 * quando e' troppo tardi per cambiare idea.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const query = coverageQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return jsonSuccess({
      items: await priceListsRepository(user.organizationId).coperture(query.supplierId),
    });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_LISTINI);
  }
}
