import { z } from 'zod';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin, readJsonRequest } from '@/server/http/json-request';
import { orderDocumentsRepository } from '@/server/repositories/order-documents';
import { ERRORI_ORDINE } from '../../errori';

export const dynamic = 'force-dynamic';

/**
 * I documenti di un ordine: elencarli e generarli.
 *
 * La generazione è una `POST` e non un effetto della conferma. Confermare e
 * generare sono due cose che falliscono per ragioni diverse — la prima per un
 * prezzo sparito, la seconda perché Chromium non parte — e legarle
 * significherebbe che un browser che non si avvia impedisce di confermare un
 * ordine. Separati, un guasto della stampa lascia l'ordine confermato e si
 * ritenta il documento.
 */

const corpo = z.object({
  /** Quali formati. Vuoto o assente: i predefiniti. */
  formati: z.array(z.string().min(1).max(80)).max(20).optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    const { id } = await context.params;
    const documenti = orderDocumentsRepository(user.organizationId);
    return jsonSuccess({
      documenti: await documenti.elenco(id),
      formati: documenti.formatiDisponibili(),
    });
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere i documenti.', ERRORI_ORDINE);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    const dati = corpo.safeParse(await readJsonRequest(request));
    if (!dati.success) return jsonError('Formati richiesti non validi.', 422);

    return jsonSuccess(
      await orderDocumentsRepository(user.organizationId).genera(user.id, id, dati.data.formati),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile generare i documenti.', ERRORI_ORDINE);
  }
}
