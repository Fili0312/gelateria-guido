import { taxonomyQuerySchema } from '@/features/taxonomy/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { taxonomyRepository } from '@/server/repositories/taxonomy';
import { ERRORI_TASSONOMIA } from './errori';

export const dynamic = 'force-dynamic';

/**
 * L'albero intero: reparti, categorie e conteggi.
 *
 * Un endpoint solo e non uno per livello perche' ogni schermata che usa la
 * tassonomia la usa tutta — il selettore del form, i filtri dell'elenco, la
 * pagina delle impostazioni — e due richieste per disegnare un menu a tendina
 * sono due occasioni perche' una arrivi e l'altra no.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    const query = taxonomyQuerySchema.parse(rawQuery);
    return jsonSuccess(await taxonomyRepository(user.organizationId).tree(query));
  } catch (error) {
    return mappedErrorResponse(error, 'I filtri richiesti non sono validi.', ERRORI_TASSONOMIA);
  }
}
