import { z } from 'zod';
import { supplierProductPatchSchema } from '@/features/products/schema';
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

type Contesto = { params: Promise<{ id: string }> };

/**
 * Collegamento e attivazione hanno un corpo tutto loro perche' non sono
 * modifiche dell'anagrafica: `productId: null` scollega, e va distinto da
 * "campo non passato". Uno schema separato lo rende esplicito.
 */
const azioneSchema = z.union([
  z.object({ azione: z.literal('collega'), productId: z.string().trim().max(64).nullable() }).strict(),
  z.object({ azione: z.literal('attiva'), active: z.boolean() }).strict(),
]);

export async function GET(_request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await params;
    return jsonSuccess(await supplierProductsRepository(user.organizationId).get(id));
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_CATALOGO);
  }
}

export async function PATCH(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    const corpo = await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES);
    const repo = supplierProductsRepository(user.organizationId);

    const azione = azioneSchema.safeParse(corpo);
    if (azione.success) {
      return jsonSuccess(
        azione.data.azione === 'collega'
          ? await repo.link(id, azione.data.productId)
          : await repo.setActive(id, azione.data.active),
      );
    }

    const patch = supplierProductPatchSchema.parse(corpo);
    return jsonSuccess(await repo.update(id, patch));
  } catch (error) {
    return mappedErrorResponse(error, 'I dati dell offerta non sono validi.', ERRORI_CATALOGO);
  }
}

export async function DELETE(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await params;
    await supplierProductsRepository(user.organizationId).delete(id);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_CATALOGO);
  }
}
