import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { annullaImport } from '@/server/import/apply';
import { ERRORI_LISTINI } from '../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * Annulla un import applicato.
 *
 * Riporta il database allo stato precedente: toglie i prezzi scritti da questo
 * listino, **riapre** quelli che avevano chiuso, cancella le offerte create da
 * questo import e da nessun altro, riattiva cio' che aveva dichiarato sparito.
 */
export async function POST(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    return jsonSuccess(await annullaImport(user.organizationId, id));
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_LISTINI);
  }
}
