import { codaQuerySchema } from '@/features/matching/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { matchingRepository } from '@/server/repositories/matching';
import { ERRORI_ABBINAMENTO } from '../errori';

export const dynamic = 'force-dynamic';

/** Le righe che aspettano una decisione. */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const query = codaQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return jsonSuccess(await matchingRepository(user.organizationId).coda(query));
  } catch (error) {
    return mappedErrorResponse(error, 'I filtri richiesti non sono validi.', ERRORI_ABBINAMENTO);
  }
}
