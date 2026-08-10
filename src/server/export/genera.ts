import 'server-only';

import { nuovaGenerazione, percorsoDocumento, rimuoviGenerazione, salvaDocumento } from './archivio';
import { datiOrdine, soloFornitore } from './dati';
import { conStampante } from './pdf';
import { templatePerChiave, templatePredefiniti } from './registro';
import type { DatiDocumento, DocumentTemplate, FormatoDocumento } from './template';

/**
 * Da un ordine confermato ai file, senza toccare il database.
 *
 * Questo modulo produce **byte e nomi**; è il repository che poi scrive le
 * righe. La separazione serve a una cosa concreta: i file si scrivono su
 * disco fuori dalla transazione — un `pnpm exec` di Chromium dentro una
 * transazione la terrebbe aperta per il tempo di avviare un browser, e con
 * l'isolamento Serializable che usiamo altrove significa far fallire tutto
 * quello che gira nel frattempo.
 *
 * L'ordine dei tentativi conta: se la generazione fallisce a metà, chi chiama
 * cancella l'intera cartella di generazione. Un ordine con due PDF su tre e
 * nessuna riga nel database è uno stato che nessuno saprebbe interpretare.
 */

export class GenerazioneError extends Error {
  override readonly name = 'GenerazioneError';
}

export interface DocumentoProdotto {
  templateKey: string;
  format: FormatoDocumento;
  /** `null` per il riepilogo, che non è di nessun fornitore in particolare. */
  supplierId: string | null;
  fileName: string;
  /** Relativo alla cartella di storage. */
  filePath: string;
  sizeBytes: number;
}

export interface EsitoGenerazione {
  generazione: string;
  documenti: DocumentoProdotto[];
}

/** Il template più i dati già ristretti a ciò che deve stampare. */
function lavori(
  dati: DatiDocumento,
  template: readonly DocumentTemplate[],
): { template: DocumentTemplate; dati: DatiDocumento; supplierId: string | null }[] {
  const elenco: { template: DocumentTemplate; dati: DatiDocumento; supplierId: string | null }[] =
    [];
  for (const t of template) {
    if (t.ambito === 'per-fornitore') {
      for (const gruppo of dati.gruppi) {
        const ristretti = soloFornitore(dati, gruppo.supplierId);
        if (ristretti) {
          elenco.push({ template: t, dati: ristretti, supplierId: gruppo.supplierId });
        }
      }
    } else {
      elenco.push({ template: t, dati, supplierId: null });
    }
  }
  return elenco;
}

export async function generaDocumenti(
  organizationId: string,
  orderId: string,
  chiavi?: readonly string[],
): Promise<EsitoGenerazione> {
  const dati = await datiOrdine(organizationId, orderId);
  if (!dati) throw new GenerazioneError('L’ordine non esiste, o è ancora una bozza.');
  if (dati.gruppi.length === 0) {
    throw new GenerazioneError('L’ordine non ha righe: non c’è niente da mandare.');
  }

  const scelti = chiavi?.length
    ? chiavi.map((k) => {
        const t = templatePerChiave(k);
        if (!t) throw new GenerazioneError(`Formato sconosciuto: ${k}`);
        return t;
      })
    : templatePredefiniti();

  const daFare = lavori(dati, scelti);
  const generazione = nuovaGenerazione();
  const prodotti: DocumentoProdotto[] = [];

  try {
    // Un solo avvio di Chromium per tutta l'infornata: con tre fornitori sono
    // tre PDF e un avvio, non tre avvii.
    await conStampante(async (stampaPdf) => {
      for (const lavoro of daFare) {
        const contenuto = await lavoro.template.build(lavoro.dati, { stampaPdf });
        if (contenuto.byteLength === 0) {
          throw new GenerazioneError(`${lavoro.template.label} ha prodotto un file vuoto.`);
        }
        const fileName = lavoro.template.nomeFile(lavoro.dati);
        const filePath = percorsoDocumento(orderId, generazione, fileName);
        const sizeBytes = await salvaDocumento(filePath, contenuto);
        prodotti.push({
          templateKey: lavoro.template.key,
          format: lavoro.template.format,
          supplierId: lavoro.supplierId,
          fileName,
          filePath,
          sizeBytes,
        });
      }
    });
  } catch (errore) {
    // Mezza generazione su disco non serve a nessuno e confonde chi guarda la
    // cartella: o ci sono tutti i file, o non ce n'è nessuno.
    await rimuoviGenerazione(orderId, generazione);
    throw errore;
  }

  return { generazione, documenti: prodotti };
}
