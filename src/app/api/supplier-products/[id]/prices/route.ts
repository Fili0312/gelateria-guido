import { manualPriceSchema, priceHistoryQuerySchema } from '@/features/prices/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { pricesRepository } from '@/server/repositories/prices';
import { ERRORI_PREZZI } from './errori';

export const dynamic = 'force-dynamic';

type Contesto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await params;
    const query = priceHistoryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const storico = await pricesRepository(user.organizationId).history(id, query.at);
    return jsonSuccess(storico);
  } catch (error) {
    return mappedErrorResponse(error, 'La data richiesta non è valida.', ERRORI_PREZZI);
  }
}

export async function POST(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    const input = manualPriceSchema.parse(
      await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES),
    );
    const risultato = await pricesRepository(user.organizationId).setManualPrice(
      id,
      input,
      user.id,
    );
    return jsonSuccess(risultato, risultato.created ? 201 : 200);
  } catch (error) {
    return mappedErrorResponse(error, 'I dati del prezzo non sono validi.', ERRORI_PREZZI);
  }
}
