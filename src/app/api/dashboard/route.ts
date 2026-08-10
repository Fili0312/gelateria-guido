import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { dashboardRepository } from '@/server/repositories/dashboard';

export const dynamic = 'force-dynamic';

/** La stessa DTO minima usata dal Server Component, sempre tenant-scoped. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    return jsonSuccess(await dashboardRepository(user.organizationId).panoramica(user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile caricare la panoramica.');
  }
}
