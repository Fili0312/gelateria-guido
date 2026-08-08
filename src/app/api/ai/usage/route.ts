import { getCurrentUser } from '@/server/auth';
import { budgetMensile, spesaDelMese } from '@/server/ai';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';

export const dynamic = 'force-dynamic';

/**
 * Quanto si e' speso in chiamate al modello, questo mese.
 *
 * Sta dietro autenticazione come tutto il resto: non e' un dato pubblico, e
 * dice indirettamente quanto lavora l'import.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const speso = await spesaDelMese(user.organizationId);
    const tetto = budgetMensile();
    return jsonSuccess({
      spesoUsd: Number(speso.toFixed(6)),
      tettoUsd: tetto,
      residuoUsd: Number(Math.max(0, tetto - speso).toFixed(6)),
      // `true` quando il tetto e' raggiunto: da quel momento le lavorazioni
      // si fermano invece di continuare a spendere.
      esaurito: speso >= tetto,
    });
  } catch (error) {
    return mappedErrorResponse(error, 'Richiesta non valida.');
  }
}
