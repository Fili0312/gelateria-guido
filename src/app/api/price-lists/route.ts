import { ZodError } from 'zod';
import {
  MAX_PDF_BYTE,
  priceListListQuerySchema,
  priceListUploadSchema,
} from '@/features/price-lists/schema';
import { getCurrentUser } from '@/server/auth';
import { jsonError, jsonSuccess, mappedErrorResponse } from '@/server/http/api-response';
import { hasTrustedMutationOrigin } from '@/server/http/json-request';
import { avviaInBackground } from '@/server/import/runner';
import { rimuoviPdf, salvaPdf, sembraPdf, sha256 } from '@/server/import/storage';
import { priceListsRepository } from '@/server/repositories/price-lists';
import { ERRORI_LISTINI } from './errori';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    const query = priceListListQuerySchema.parse(rawQuery);
    return jsonSuccess(await priceListsRepository(user.organizationId).list(query));
  } catch (error) {
    return mappedErrorResponse(error, 'I filtri richiesti non sono validi.', ERRORI_LISTINI);
  }
}

/**
 * Il caricamento di un listino.
 *
 * Arriva come `multipart/form-data` e non come JSON: un PDF in base64
 * dentro un JSON costerebbe un terzo in più di banda e obbligherebbe a
 * tenerlo tutto in memoria due volte.
 *
 * L'ordine dei controlli non è casuale — prima i metadati, poi il file. Se il
 * fornitore manca o la copertura è vuota, la richiesta muore prima che si
 * scriva un byte sul disco.
 */
export async function POST(request: Request) {
  let salvato: string | null = null;
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const tipo = request.headers.get('content-type') ?? '';
    if (!tipo.toLowerCase().startsWith('multipart/form-data')) {
      return jsonError('Il caricamento richiede un modulo multipart/form-data.', 415);
    }

    const dichiarata = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(dichiarata) && dichiarata > MAX_PDF_BYTE) {
      return jsonError(
        `Il file supera il limite di ${Math.round(MAX_PDF_BYTE / 1024 / 1024)} MB.`,
        413,
      );
    }

    const modulo = await request.formData();
    const dati = priceListUploadSchema.parse({
      supplierId: modulo.get('supplierId') ?? '',
      scopeLabel: modulo.get('scopeLabel') ?? '',
      ...(modulo.get('documentType') ? { documentType: modulo.get('documentType') } : {}),
      ...(modulo.get('mode') ? { mode: modulo.get('mode') } : {}),
    });

    const file = modulo.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return jsonError('Scegli il file PDF del listino.', 400, {
        fields: { file: ['Nessun file caricato.'] },
      });
    }
    if (file.size > MAX_PDF_BYTE) {
      return jsonError(
        `Il file supera il limite di ${Math.round(MAX_PDF_BYTE / 1024 / 1024)} MB.`,
        413,
      );
    }

    const contenuto = new Uint8Array(await file.arrayBuffer());
    if (!sembraPdf(contenuto)) {
      // Il controllo è sui primi byte e non sull'estensione: un `.pdf` che è
      // in realtà un Word arriverebbe fin qui e fallirebbe molto più avanti,
      // con un messaggio che non aiuta.
      return jsonError('Il file non è un PDF.', 400, {
        fields: { file: ['Carica il PDF del listino, non un altro formato.'] },
      });
    }

    const hash = sha256(contenuto);
    const pdf = await salvaPdf(contenuto, hash);
    // Solo se l'ha creato questa richiesta: un doppione trova il file gia'
    // sul disco, e cancellarlo porterebbe via quello del listino originale.
    if (pdf.creato) salvato = pdf.percorso;

    const id = await priceListsRepository(user.organizationId).crea({
      dati,
      originalFilename: file.name.slice(0, 255),
      storagePath: pdf.percorso,
      fileHash: hash,
      uploadedById: user.id,
    });
    // Da qui in avanti il file appartiene al listino: non va più rimosso se
    // qualcosa fallisce a valle.
    salvato = null;

    avviaInBackground(id);
    return jsonSuccess({ id }, 201);
  } catch (error) {
    // Il PDF salvato ma mai registrato sarebbe un file orfano sul disco, che
    // nessuna schermata mostra e nessuno cancella mai.
    if (salvato) await rimuoviPdf(salvato);
    if (error instanceof ZodError) {
      return mappedErrorResponse(error, 'Scegli fornitore e nome del listino.', ERRORI_LISTINI);
    }
    return mappedErrorResponse(error, 'Il caricamento non è riuscito.', ERRORI_LISTINI);
  }
}
