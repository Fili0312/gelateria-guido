import { getCurrentUser } from '@/server/auth';
import { jsonError, mappedErrorResponse } from '@/server/http/api-response';
import { contentDisposition } from '@/server/export/nome-file';
import { orderDocumentsRepository } from '@/server/repositories/order-documents';
import { ERRORI_ORDINE } from '../../../errori';

export const dynamic = 'force-dynamic';

const TIPI: Record<string, string> = {
  PDF: 'application/pdf',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv; charset=utf-8',
};

/**
 * Riscarica un documento **dal disco**, esattamente com'era.
 *
 * Non lo rigenera: rigenerare a ogni scaricamento produrrebbe un file diverso
 * ogni volta — bastano i contatti del fornitore aggiornati nel frattempo — e
 * chi riapre l'ordine per verificare cosa ha mandato si troverebbe davanti a
 * un documento che non è quello che ha mandato.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id, documentId } = await context.params;
    const documento = await orderDocumentsRepository(user.organizationId).scarica(id, documentId);
    if (!documento) return jsonError('Documento non trovato.', 404);

    return new Response(new Uint8Array(documento.contenuto), {
      headers: {
        'Content-Type': TIPI[documento.format] ?? 'application/octet-stream',
        'Content-Length': String(documento.contenuto.byteLength),
        'Content-Disposition': contentDisposition(documento.fileName),
        // Un documento d'ordine non va in nessuna cache condivisa: contiene
        // prezzi concordati, e la cache non sa a quale organizzazione
        // appartengono.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return mappedErrorResponse(error, 'Non è stato possibile scaricare il documento.', ERRORI_ORDINE);
  }
}
