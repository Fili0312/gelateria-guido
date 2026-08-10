import { getCurrentUser } from '@/server/auth';
import { jsonError, mappedErrorResponse } from '@/server/http/api-response';
import { contentDisposition } from '@/server/export/nome-file';
import { orderDocumentsRepository } from '@/server/repositories/order-documents';
import { ERRORI_ORDINE } from '../../../errori';

export const dynamic = 'force-dynamic';

/**
 * Tutti i documenti dell'ultima generazione, in uno zip.
 *
 * Chi ordina da tre fornitori scarica tre PDF e un Excel per allegarli alle
 * email: quattro clic e quattro finestre di salvataggio, ogni volta che si
 * ordina. Uno zip è un clic.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await context.params;
    const archivio = await orderDocumentsRepository(user.organizationId).archivio(id);
    if (!archivio) return jsonError('Questo ordine non ha ancora documenti.', 404);

    return new Response(Buffer.from(archivio.contenuto) as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(archivio.contenuto.byteLength),
        'Content-Disposition': contentDisposition(archivio.fileName),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile creare l’archivio.', ERRORI_ORDINE);
  }
}
