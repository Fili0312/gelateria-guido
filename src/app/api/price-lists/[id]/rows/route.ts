import { rowsQuerySchema } from '@/features/price-lists/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { priceListsRepository } from '@/server/repositories/price-lists';
import { ERRORI_LISTINI } from '../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * Le righe grezze estratte dal PDF.
 *
 * Con `tipo=tutte` compaiono anche quelle che il segmentatore non ha capito:
 * e' la vista che serve per giudicare se l'estrazione ha funzionato. Mostrare
 * solo cio' che ha riconosciuto darebbe sempre l'impressione che sia andata
 * bene.
 */
export async function GET(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await params;
    const query = rowsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return jsonSuccess(await priceListsRepository(user.organizationId).righe(id, query));
  } catch (error) {
    return mappedErrorResponse(error, 'I filtri richiesti non sono validi.', ERRORI_LISTINI);
  }
}
