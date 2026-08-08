import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { matchingRepository } from '@/server/repositories/matching';
import { ERRORI_ABBINAMENTO } from '../../../matching/errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * Scollega un'offerta dal prodotto canonico.
 *
 * Un abbinamento automatico non e' mai irreversibile: questa e' la strada
 * per disfarlo. L'offerta e il suo storico prezzi restano intatti, e viene
 * scritto un sinonimo negativo perche' il prossimo import non rifaccia lo
 * stesso abbinamento appena sciolto.
 */
export async function POST(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    await matchingRepository(user.organizationId).scollega(id);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_ABBINAMENTO);
  }
}
