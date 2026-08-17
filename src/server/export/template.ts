import 'server-only';

import type { UnitOfMeasureValue } from '@/features/products/schema';

/**
 * Cosa deve saper fare un documento d'ordine, e niente di più.
 *
 * L'obiettivo di questo file è che **aggiungere un formato non richieda di
 * toccare niente fuori da `server/export/`**. Un nuovo template è un file
 * accanto a questo più una riga nel registro in fondo: le API, le schermate,
 * il salvataggio e lo zip non cambiano, perché nessuno di loro sa quali
 * template esistono — li chiedono al registro.
 *
 * Il giorno che un fornitore vorrà il CSV nel suo tracciato, o che serviranno
 * due varianti di PDF (con e senza prezzi, per il magazziniere), la modifica
 * è un file nuovo. Senza questo vincolo il formato si infila nelle API, nelle
 * pagine e nei nomi dei file, e "aggiungere un CSV" diventa una giornata.
 */

export type FormatoDocumento = 'PDF' | 'XLSX' | 'CSV';

/**
 * `per-fornitore` produce un file per ogni fornitore dell'ordine, `unico` un
 * file solo con tutti dentro.
 *
 * La distinzione la applica l'orchestratore, non il template: quando il
 * template viene chiamato i `gruppi` che riceve sono già quelli giusti. Così
 * un template non può sbagliare a filtrare e mandare a Cecconi le righe di
 * Barzelli, che è l'errore più imbarazzante che questa fase possa fare.
 */
export type AmbitoDocumento = 'per-fornitore' | 'unico';

export interface Intestazione {
  /** Chi ordina. Il fornitore deve capirlo dalla prima riga. */
  nome: string;
  indirizzo: string | null;
  partitaIva: string | null;
  telefono: string | null;
  email: string | null;
  /** Dove va consegnata la merce: il magazzino non è sempre la sede. */
  consegnaPresso: string | null;
  /** Quando la si vuole. Calcolata dalla data dell'ordine. */
  consegnaEntro: Date | null;
  condizioniPagamento: string | null;
  bancaAppoggio: string | null;
  clausolaAccettazione: string | null;
}

export interface RigaDocumento {
  /** Il codice **del fornitore**: è l'unico che lui sa cercare a magazzino. */
  supplierCode: string | null;
  name: string;
  packQuantity: number;
  /** La sigla d'imballo congelata: distingue «collo da 12» da «bottiglia». */
  packagingType: string | null;
  packQuantityConfirmed: boolean;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  quantityPacks: number;
  /** Prezzo per confezione, congelato alla conferma. */
  priceNet: string;
  lineTotalNet: string;
  note: string | null;
}

export interface GruppoFornitore {
  supplierId: string;
  /** Il nome congelato nell'ordine, non quello di oggi. */
  supplierName: string;
  /**
   * I contatti si leggono **adesso**, non dallo snapshot: il documento serve a
   * mandarlo, e va mandato all'indirizzo di oggi. È l'opposto dei prezzi, che
   * devono restare quelli di allora perché sono l'accordo.
   */
  indirizzo: string | null;
  partitaIva: string | null;
  email: string | null;
  /** Il recapito del fornitore: chi riceve l'ordine spesso richiama. */
  telefono: string | null;
  righe: RigaDocumento[];
  netto: string;
  iva: string;
  lordo: string;
  confezioni: number;
}

export interface DatiDocumento {
  ordine: {
    id: string;
    /** `2026-0042`: il riferimento che noi e il fornitore abbiamo in comune. */
    code: string | null;
    stato: string;
    note: string | null;
    confermatoIl: Date | null;
    creatoIl: Date;
  };
  intestazione: Intestazione;
  gruppi: GruppoFornitore[];
  /**
   * I totali dei **gruppi presenti**, sempre.
   *
   * Non i totali dell'ordine intero: su un PDF per fornitore il totale
   * dell'ordine complessivo sarebbe un numero più grande di quello che si
   * paga a quel fornitore, stampato accanto alle sue righe. Chi lo riceve
   * legge l'ultimo numero in fondo, e quel numero deve essere il suo.
   */
  totali: {
    netto: string;
    iva: string;
    lordo: string;
    righe: number;
    confezioni: number;
  };
}

/** Quello che il template può usare per produrre il file. */
export interface ContestoStampa {
  /**
   * Trasforma HTML in PDF col Chromium del server.
   *
   * Sta nel contesto e non fra gli import del template perché il browser si
   * apre **una volta per infornata**: tre PDF in un ordine da tre fornitori
   * costano un avvio, non tre.
   */
  stampaPdf(html: string): Promise<Uint8Array>;
}

export interface DocumentTemplate {
  /** Identificatore stabile: finisce nel database, non cambiarlo mai. */
  readonly key: string;
  /** Come si chiama per chi lo usa. */
  readonly label: string;
  readonly format: FormatoDocumento;
  readonly ambito: AmbitoDocumento;
  /** Se `false` il template non compare fra quelli generati d'ufficio. */
  readonly predefinito: boolean;
  nomeFile(dati: DatiDocumento): string;
  build(dati: DatiDocumento, contesto: ContestoStampa): Promise<Uint8Array>;
}
