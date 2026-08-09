import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { comparisonRepository } from '@/server/repositories/comparison';

export const dynamic = 'force-dynamic';

/**
 * Le offerte di un prodotto, già confrontate.
 *
 * Restituisce il confronto e non l'elenco grezzo: se ogni schermata ordinasse
 * le offerte per conto proprio, il «più conveniente» del catalogo e quello
 * della scheda potrebbero indicare fornitori diversi — e nessuno dei due
 * sarebbe evidentemente sbagliato guardandolo da solo.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await context.params;
    const confronto = await comparisonRepository(user.organizationId).perProdotto(id);
    if (!confronto) return jsonError('Prodotto non trovato.', 404);

    return jsonSuccess(confronto);
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere le offerte.', []);
  }
}
