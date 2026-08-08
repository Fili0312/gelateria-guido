import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { anteprima } from '@/server/import/apply';
import { ERRORI_LISTINI } from '../../errori';

export const dynamic = 'force-dynamic';

interface Contesto {
  params: Promise<{ id: string }>;
}

/**
 * Cosa succederebbe applicando, senza applicare.
 *
 * E' quello che la schermata di revisione mostra prima di chiedere conferma.
 */
export async function GET(request: Request, { params }: Contesto) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await params;
    const { confronti, riepilogo } = await anteprima(user.organizationId, id);
    return jsonSuccess({
      riepilogo,
      // Le righe che una persona deve decidere prima di poter applicare.
      daDecidere: confronti
        .filter((c) => c.esito === 'CONFEZIONE_CAMBIATA')
        .map((c) => ({
          rigaId: c.chiaveRiga,
          supplierProductId: c.supplierProductId,
          differenze: c.differenze,
          prezzoPrima: c.prezzoPrima?.toString() ?? null,
          prezzoDopo: c.prezzoDopo?.toString() ?? null,
        })),
      anomale: confronti
        .filter((c) => c.variazionePct !== null && c.variazionePct.abs().gt(40))
        .map((c) => ({
          rigaId: c.chiaveRiga,
          variazionePct: c.variazionePct?.toString() ?? null,
          prezzoPrima: c.prezzoPrima?.toString() ?? null,
          prezzoDopo: c.prezzoDopo?.toString() ?? null,
        })),
    });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.', ERRORI_LISTINI);
  }
}
