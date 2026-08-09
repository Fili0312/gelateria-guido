import { ricercaOrdinabileSchema } from '@/features/orders/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../errori';

export const dynamic = 'force-dynamic';

/**
 * La ricerca della schermata ordine.
 *
 * Diversa da `/api/products/search`: quella trova prodotti, questa trova
 * **cosa si può ordinare** — ogni risultato porta le offerte già confrontate,
 * il prezzo, il fornitore più conveniente e quante confezioni sono già
 * nell'ordine. Farlo in una richiesta sola è il motivo per cui la schermata
 * può sembrare istantanea: una ricerca più una chiamata per riga no.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const grezzi = Object.fromEntries(new URL(request.url).searchParams);
    const query = ricercaOrdinabileSchema.parse(grezzi);
    return jsonSuccess(await ordersRepository(user.organizationId).cerca(user.id, query));
  } catch (error) {
    return mappedErrorResponse(error, 'La ricerca non è valida.', ERRORI_ORDINE);
  }
}
