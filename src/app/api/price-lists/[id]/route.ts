import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { priceListsRepository } from '@/server/repositories/price-lists';
import { ERRORI_LISTINI } from '../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * La scheda del listino, con lo stato della lavorazione.
 *
 * E' anche l'endpoint che la schermata di avanzamento interroga a ripetizione
 * mentre il job gira: contiene gia' fase, percentuale e ultimo segno di vita,
 * cosi' non serve una seconda chiamata per sapere se sta ancora lavorando.
 */
export async function GET(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await params;
    const listino = await priceListsRepository(user.organizationId).get(id);
    if (!listino) return jsonError('Listino non trovato.', 404);
    return jsonSuccess(listino);
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_LISTINI);
  }
}
