import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { applicaImport } from '@/server/import/apply';
import { ERRORI_LISTINI } from '../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * Porta i dati dallo staging al catalogo, in una sola transazione.
 *
 * Si rifiuta di partire se restano righe con la confezione cambiata: quelle
 * vanno decise da una persona, e applicarle in automatico farebbe sembrare un
 * cambio di prezzo quello che e' un cambio di confezione.
 */
export async function POST(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    return jsonSuccess(await applicaImport(user.organizationId, id, user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_LISTINI);
  }
}
