import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { priceListsRepository } from '@/server/repositories/price-lists';
import { ERRORI_LISTINI } from '../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * Ferma la lavorazione.
 *
 * Non cancella niente: le righe gia' estratte restano visibili. Chi ha fermato
 * un import per sbaglio deve poter vedere cosa era stato letto fin li'.
 */
export async function POST(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    await priceListsRepository(user.organizationId).annulla(id);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_LISTINI);
  }
}
