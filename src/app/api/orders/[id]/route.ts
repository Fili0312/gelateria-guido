import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../errori';

export const dynamic = 'force-dynamic';

/** Un ordine congelato, letto **solo dagli snapshot**. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await context.params;
    const ordine = await ordersRepository(user.organizationId).storico(id);
    if (!ordine) return jsonError('Ordine non trovato.', 404);
    return jsonSuccess(ordine);
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere l’ordine.', ERRORI_ORDINE);
  }
}
