import 'server-only';

import { leggiDocumento, rimuoviGenerazione, zipDi } from '@/server/export/archivio';
import { generaDocumenti, GenerazioneError } from '@/server/export/genera';
import { templateInElenco } from '@/server/export/registro';
import { nomeFile } from '@/server/export/nome-file';
import { prismaForOrganization } from '@/server/db';

/**
 * I documenti di un ordine: generarli, elencarli, riscaricarli.
 *
 * `order_document` non ha `organizationId`, quindi il client scoped lo nasconde
 * di proposito: ci si arriva **solo annidati dall'ordine**, che l'organizzazione
 * ce l'ha. È scomodo da scrivere ed è il punto: una query sui documenti che si
 * dimentica di filtrare per organizzazione non compila, invece di restituire i
 * PDF di un'altra gelateria.
 */

export interface DocumentoInElenco {
  id: string;
  fileName: string;
  format: string;
  templateKey: string;
  /** Come si chiama il formato per chi guarda. */
  etichetta: string;
  supplierId: string | null;
  supplierName: string | null;
  sizeBytes: number;
  createdAt: string;
}

export class DocumentiError extends Error {
  override readonly name = 'DocumentiError';
}

export function orderDocumentsRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  async function elencoDi(orderId: string): Promise<DocumentoInElenco[]> {
    const etichette = new Map(templateInElenco().map((t) => [t.key, t.label]));
    const ordine = await db.order.findFirst({
      where: { id: orderId },
      select: {
        documents: {
          select: {
            id: true,
            fileName: true,
            format: true,
            templateKey: true,
            supplierId: true,
            sizeBytes: true,
            createdAt: true,
            supplier: { select: { name: true } },
          },
          // Il più recente per primo: dopo una rigenerazione è quello che si
          // sta cercando, e i precedenti restano sotto invece di sparire.
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!ordine) return [];
    return ordine.documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      format: d.format,
      templateKey: d.templateKey,
      etichetta: etichette.get(d.templateKey) ?? d.templateKey,
      supplierId: d.supplierId,
      supplierName: d.supplier?.name ?? null,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  return {
    elenco: elencoDi,

    formatiDisponibili: templateInElenco,

    /**
     * Genera i documenti e li registra.
     *
     * I file si scrivono **prima**, fuori da qualsiasi transazione: produrre un
     * PDF significa avviare Chromium, e una transazione tenuta aperta per il
     * tempo di un avvio di browser fa fallire tutto quello che gira nel
     * frattempo — con l'isolamento Serializable che usiamo altrove, in modo
     * particolarmente rumoroso.
     *
     * Se poi le righe non si scrivono, i file appena creati si cancellano: un
     * PDF su disco che il database non conosce non lo troverebbe più nessuno,
     * e resterebbe lì per sempre.
     */
    async genera(
      userId: string,
      orderId: string,
      chiavi?: readonly string[],
    ): Promise<DocumentoInElenco[]> {
      const esito = await generaDocumenti(organizationId, orderId, chiavi);
      try {
        await db.order.update({
          where: { id: orderId },
          data: {
            documents: {
              create: esito.documenti.map((d) => ({
                supplierId: d.supplierId,
                format: d.format,
                templateKey: d.templateKey,
                filePath: d.filePath,
                fileName: d.fileName,
                sizeBytes: d.sizeBytes,
                createdById: userId,
              })),
            },
          },
          select: { id: true },
        });
      } catch (errore) {
        await rimuoviGenerazione(orderId, esito.generazione);
        throw errore;
      }
      return elencoDi(orderId);
    },

    /** Un documento, riletto dal disco esattamente com'era. */
    async scarica(
      orderId: string,
      documentId: string,
    ): Promise<{ fileName: string; format: string; contenuto: Buffer } | null> {
      const ordine = await db.order.findFirst({
        where: { id: orderId },
        select: {
          documents: {
            where: { id: documentId },
            select: { fileName: true, format: true, filePath: true },
          },
        },
      });
      const documento = ordine?.documents[0];
      if (!documento) return null;
      try {
        return {
          fileName: documento.fileName,
          format: documento.format,
          contenuto: await leggiDocumento(documento.filePath),
        };
      } catch {
        // La riga c'è e il file no: è successo qualcosa al disco, e dirlo è
        // meglio che restituire uno zero byte che sembra un documento vuoto.
        throw new DocumentiError(
          `Il file di «${documento.fileName}» non si trova più sul disco. Rigenera i documenti.`,
        );
      }
    },

    /** Tutti i documenti dell'ultima generazione, in un archivio solo. */
    async archivio(orderId: string): Promise<{ fileName: string; contenuto: Uint8Array } | null> {
      const ordine = await db.order.findFirst({
        where: { id: orderId },
        select: {
          code: true,
          confirmedAt: true,
          createdAt: true,
          documents: {
            select: { fileName: true, filePath: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!ordine || ordine.documents.length === 0) return null;

      // Solo l'ultima generazione: mettere dentro anche le precedenti darebbe
      // uno zip con due PDF quasi identici per lo stesso fornitore, e chi lo
      // apre non ha modo di sapere quale allegare.
      //
      // Si raggruppa per **cartella di generazione**, che è già nel percorso,
      // e non per vicinanza di data: generare tre PDF può durare più di
      // qualunque finestra si scelga, e una finestra troppo larga farebbe
      // entrare nello zip i documenti di una rigenerazione precedente.
      const generazione = ordine.documents[0]!.filePath.split('/')[2];
      const ultimi = ordine.documents.filter((d) => d.filePath.split('/')[2] === generazione);

      return {
        fileName: nomeFile({
          data: ordine.confirmedAt ?? ordine.createdAt,
          codice: ordine.code,
          qualifica: 'documenti',
          estensione: 'zip',
        }),
        contenuto: await zipDi(
          ultimi.map((d) => ({ nome: d.fileName, percorso: d.filePath })),
        ),
      };
    },
  };
}

export { GenerazioneError };
