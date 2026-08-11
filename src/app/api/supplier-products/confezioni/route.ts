import { z } from 'zod';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  readJsonRequest,
} from '@/server/http/json-request';
import { supplierProductsRepository } from '@/server/repositories/supplier-products';
import { ERRORI_CATALOGO } from '../../products/errori';

export const dynamic = 'force-dynamic';

/**
 * Dichiarare quanti pezzi contiene una confezione, per un gruppo intero.
 *
 * Il gruppo si identifica con la sua chiave — fornitore, imballo, formato — e
 * non con l'elenco degli id: quali offerte ne facciano parte lo decide il
 * server nel momento in cui scrive. Mandare gli id significherebbe agire su
 * una fotografia presa quando la pagina è stata aperta, e nel frattempo un
 * import può averne aggiunte.
 */
const corpo = z.object({
  supplierId: z.string().trim().min(1).max(64),
  packagingType: z.string().trim().max(20).nullable(),
  unitSize: z.string().trim().min(1).max(20),
  unitOfMeasure: z.string().trim().min(1).max(10),
  pezzi: z.coerce.number().int().min(1).max(10_000),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    return jsonSuccess(await supplierProductsRepository(user.organizationId).gruppiDaDefinire());
  } catch (error) {
    return mappedErrorResponse(
      error,
      'Non è stato possibile leggere le confezioni.',
      ERRORI_CATALOGO,
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const dati = corpo.parse(await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES));
    const { pezzi, ...chiave } = dati;
    return jsonSuccess(
      await supplierProductsRepository(user.organizationId).definisciConfezione(chiave, pezzi),
    );
  } catch (error) {
    return mappedErrorResponse(
      error,
      'Non è stato possibile definire la confezione.',
      ERRORI_CATALOGO,
    );
  }
}
