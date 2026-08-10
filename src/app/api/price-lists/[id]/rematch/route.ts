import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { proponiAbbinamenti } from '@/server/import/matching/proposte';
import { prismaForOrganization } from '@/server/db';

export const dynamic = 'force-dynamic';

/**
 * Ricalcola gli abbinamenti di un listino già estratto.
 *
 * Serve perché l'abbinamento avviene **al momento dell'import**, contro il
 * catalogo com'era allora. Un listino caricato quando il catalogo era vuoto
 * non ha trovato niente a cui agganciarsi, e applicandolo creerebbe un
 * prodotto nuovo per ogni riga — compresi quelli che un altro fornitore
 * vende già. Il catalogo si riempirebbe di doppioni e il confronto prezzi
 * non troverebbe mai due offerte sullo stesso prodotto.
 *
 * Le righe **già decise da una persona non si toccano**: `proponiAbbinamenti`
 * salta quelle con `reviewedAt`. Ricalcolare non deve poter cancellare una
 * conferma.
 *
 * Non si può fare su un listino già applicato: le offerte esistono, e
 * cambiare le proposte a valle non le sposterebbe. Prima si annulla.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    const db = prismaForOrganization(user.organizationId);
    const listino = await db.priceList.findFirst({
      where: { id },
      select: { id: true, status: true },
    });
    if (!listino) return jsonError('Listino non trovato.', 404);

    if (listino.status === 'APPLIED') {
      return jsonError(
        'Il listino è già applicato: gli abbinamenti non si possono ricalcolare senza prima annullare l’import.',
        409,
      );
    }
    if (listino.status !== 'REVIEW') {
      return jsonError(
        `Il listino è in stato ${listino.status}: si possono ricalcolare gli abbinamenti solo quando è in revisione.`,
        409,
      );
    }

    return jsonSuccess(await proponiAbbinamenti(id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile ricalcolare gli abbinamenti.', []);
  }
}
