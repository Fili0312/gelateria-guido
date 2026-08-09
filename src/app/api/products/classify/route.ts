import { z } from 'zod';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { classificaProdotti } from '@/server/catalog/classify';

export const dynamic = 'force-dynamic';

const corpoSchema = z
  .object({
    /** `false` ferma alla regola: nessuna chiamata al modello, nessuna spesa. */
    usaModello: z.boolean().default(false),
    massimo: z.number().int().min(1).max(500).optional(),
  })
  .strict();

/**
 * Dà una categoria ai prodotti che non ce l'hanno.
 *
 * Due modi, e la differenza è dichiarata a chi preme: **la regola** guarda le
 * parole e costa zero; **il modello** si occupa solo di ciò che la regola non
 * ha saputo decidere, cioè di ciò che richiede di sapere cosa sono le cose.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const corpo = corpoSchema.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    return jsonSuccess(await classificaProdotti(user.organizationId, corpo));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile classificare i prodotti.', [
      { nome: 'AiBudgetError', status: 402 },
      { nome: 'AiError', status: 502 },
    ]);
  }
}
