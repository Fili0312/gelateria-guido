import { productStatsPeriodSchema } from '@/features/products/stats';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { productStatsRepository } from '@/server/repositories/product-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await context.params;
    const rawPeriod = new URL(request.url).searchParams.get('period') ?? '365';
    const period = productStatsPeriodSchema.parse(rawPeriod);
    const stats = await productStatsRepository(user.organizationId).get(id, period);
    if (!stats) return jsonError('Prodotto non trovato.', 404);

    return jsonSuccess(stats);
  } catch (error) {
    return mappedErrorResponse(error, 'Il periodo deve essere 30, 90, 180 o 365 giorni.', []);
  }
}
