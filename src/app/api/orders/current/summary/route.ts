import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { ordersRepository } from '@/server/repositories/orders';
import { ERRORI_ORDINE } from '../../errori';

export const dynamic = 'force-dynamic';

/**
 * Cosa guardare prima di confermare: subtotali, minimi non raggiunti, prezzi
 * cambiati da quando la riga è nata, prezzi fermi, righe senza confronto.
 *
 * Nessuna di queste segnalazioni blocca: chi ordina sa cose che l'app non sa.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    return jsonSuccess(await ordersRepository(user.organizationId).riepilogo(user.id));
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile leggere il riepilogo.', ERRORI_ORDINE);
  }
}
