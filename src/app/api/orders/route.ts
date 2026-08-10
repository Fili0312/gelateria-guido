import { elencoOrdiniSchema } from '@/features/orders/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from './errori';

export const dynamic = 'force-dynamic';

/**
 * Lo storico, paginato.
 *
 * Le bozze non compaiono: una bozza non è un ordine, è un ordine che non è
 * ancora successo, e contarla insieme alle altre gonfierebbe la spesa del mese.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const query = elencoOrdiniSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return jsonSuccess(await ordersRepository(user.organizationId).elenco(query));
  } catch (error) {
    return mappedErrorResponse(error, 'I filtri non sono validi.', ERRORI_ORDINE);
  }
}
