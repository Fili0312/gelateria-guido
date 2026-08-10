import { packagingDecisionSchema } from '@/features/price-lists/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { decidiConfezione } from '@/server/import/packaging-decision';
import { ERRORI_LISTINI } from '../../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string; rowId: string }>;
}

/** Registra una decisione umana su una confezione cambiata, senza applicarla. */
export async function PATCH(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id, rowId } = await params;
    const corpo = packagingDecisionSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    await decidiConfezione({
      organizationId: user.organizationId,
      priceListId: id,
      rowId,
      userId: user.id,
      decisione: corpo.decisioneConfezione,
    });
    return jsonSuccess({ id: rowId });
  } catch (error) {
    return mappedErrorResponse(
      error,
      'La decisione sulla confezione non è valida.',
      ERRORI_LISTINI,
    );
  }
}
