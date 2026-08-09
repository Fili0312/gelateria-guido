import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { comparisonRepository } from '@/server/repositories/comparison';
import type { ComparisonSort } from '@/features/reports/dto';

export const dynamic = 'force-dynamic';

const ORDINI: ComparisonSort[] = ['saving-desc', 'saving-pct-desc', 'name-asc'];

/**
 * Dove conviene comprare, per tutto il catalogo.
 *
 * Restituisce i confronti **e** i prodotti senza confronto in due elenchi
 * separati: un solo elenco misto costringerebbe chi consuma la risposta a
 * ridedurre la distinzione da campi nulli, e prima o poi qualcuno tratterebbe
 * «non confrontabile» come «nessun risparmio».
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const parametri = new URL(request.url).searchParams;
    const sort = parametri.get('sort') as ComparisonSort | null;

    return jsonSuccess(
      await comparisonRepository(user.organizationId).report({
        q: parametri.get('q') ?? undefined,
        departmentId: parametri.get('departmentId') ?? undefined,
        categoryId: parametri.get('categoryId') ?? undefined,
        bestSupplierId: parametri.get('bestSupplierId') ?? undefined,
        onlyAlert: parametri.get('onlyAlert') === '1',
        sort: sort && ORDINI.includes(sort) ? sort : undefined,
      }),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile calcolare il confronto.', []);
  }
}
