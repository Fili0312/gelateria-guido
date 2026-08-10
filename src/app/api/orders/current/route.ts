import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { z } from 'zod';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../errori';

export const dynamic = 'force-dynamic';

const notaSchema = z.object({ note: z.string().trim().max(2_000).nullish() }).strict();

/**
 * L'ordine in corso di questo utente, creato se non c'è.
 *
 * Una `GET` che può creare non è ortodossa, ma l'alternativa — un pulsante
 * «inizia un ordine» — aggiunge un passo a una schermata che deve essere
 * pronta all'apertura. La bozza vuota non costa nulla e non è visibile da
 * nessuna parte finché non ha righe.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    return jsonSuccess(await ordersRepository(user.organizationId).corrente(user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere l’ordine.', ERRORI_ORDINE);
  }
}

/** La nota dell'ordine: quella che finirà sul documento per il fornitore. */
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }
    const corpo = notaSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    return jsonSuccess(
      await ordersRepository(user.organizationId).scriviNota(user.id, corpo.note ?? null),
    );
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile salvare la nota.', ERRORI_ORDINE);
  }
}

/** Svuota l'ordine senza cancellarlo: la bozza resta, le righe no. */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }
    return jsonSuccess(await ordersRepository(user.organizationId).svuota(user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile svuotare l’ordine.', ERRORI_ORDINE);
  }
}
