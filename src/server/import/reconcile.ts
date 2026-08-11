import { Decimal } from 'decimal.js';

/**
 * La regola di riconciliazione.
 *
 * È il cuore della Fase 10 e la logica che decide se il catalogo resta pulito
 * o diventa un macello. Modulo **puro**: nessun database, nessuna rete — così
 * la si può mettere alla prova su casi costruiti a mano, che è l'unico modo
 * di essere sicuri di una regola che tocca prezzi e storico.
 *
 * ── Il perimetro ────────────────────────────────────────────────────────
 * Si confronta **solo** ciò che appartiene allo stesso fornitore e alla stessa
 * copertura. Mai oltre. È la ragione per cui la copertura esiste: senza,
 * caricare «liquori» di Cecconi farebbe risultare spariti tutti i suoi vini —
 * il modo peggiore di sbagliare, perché sembra un aggiornamento riuscito.
 *
 * ── L'identità di un prodotto ───────────────────────────────────────────
 * Codice fornitore **e** confezione **e** pezzi **e** formato. Quando il
 * fornitore non assegna codici (Barzelli), l'impronta deterministica della
 * riga prende il posto del codice. Senza quel ripiego ogni reimport sarebbe
 * insieme «nuovo» e «sparito» e urterebbe l'unicità dell'offerta.
 */

export type EsitoRiconciliazione =
  /** Tutto coincide: si aggiorna solo il prezzo. */
  | 'PREZZO_AGGIORNATO'
  /** Tutto coincide e anche il prezzo: non si scrive niente. */
  | 'INVARIATO'
  /** Stesso codice, confezione o formato diversi: **non** si decide da soli. */
  | 'CONFEZIONE_CAMBIATA'
  /** Codice mai visto per questo fornitore: si crea. */
  | 'NUOVO'
  /** Era a catalogo, nel file non c'è più: si disattiva. */
  | 'SPARITO'
  /** Lo stesso codice compare più volte **nello stesso file**: si salta. */
  | 'DUPLICATO';

/** L'identità completa di un'offerta, come la definisce la regola. */
export interface Identita {
  supplierCode: string | null;
  /** Identità deterministica di ripiego, usata soltanto in assenza di codice. */
  fingerprint?: string | null;
  unitaDiVendita: string | null;
  packQuantity: number;
  unitSize: Decimal;
  unitOfMeasure: string;
}

export interface OffertaACatalogo extends Identita {
  supplierProductId: string;
  /** Il prezzo netto attualmente in vigore, se c'è. */
  prezzoNetto: Decimal | null;
  active: boolean;
}

export interface RigaDelFile extends Identita {
  /** Chiave della riga nel listino. */
  chiave: string;
  prezzoNetto: Decimal | null;
  /** `false` quando l'operatore l'ha esclusa dalla revisione. */
  inclusa: boolean;
}

export interface Confronto {
  esito: EsitoRiconciliazione;
  chiaveRiga: string | null;
  supplierProductId: string | null;
  /** Cosa è cambiato, quando qualcosa è cambiato: si mostra in revisione. */
  differenze: string[];
  prezzoPrima: Decimal | null;
  prezzoDopo: Decimal | null;
  /** Variazione percentuale, quando entrambi i prezzi ci sono. */
  variazionePct: Decimal | null;
  /** Decisione umana già registrata nello staging per il cambio confezione. */
  confezioneRisolta?: boolean;
  /** False quando cambia il formato unitario: lì servirebbe un prodotto diverso. */
  nuovaConfezioneApplicabile?: boolean;
}

/** Due formati sono lo stesso formato se coincidono a meno di un millesimo. */
function stessoFormato(a: Identita, b: Identita): boolean {
  return a.unitOfMeasure === b.unitOfMeasure && a.unitSize.minus(b.unitSize).abs().lte('0.001');
}

function stessaConfezione(a: Identita, b: Identita): boolean {
  const um = (v: string | null) => (v ?? '').trim().toUpperCase();
  return a.packQuantity === b.packQuantity && um(a.unitaDiVendita) === um(b.unitaDiVendita);
}

function differenzeFra(catalogo: Identita, file: Identita): string[] {
  const diff: string[] = [];
  if (catalogo.packQuantity !== file.packQuantity) {
    diff.push(`pezzi per confezione: ${catalogo.packQuantity} → ${file.packQuantity}`);
  }
  const umA = (catalogo.unitaDiVendita ?? '').toUpperCase();
  const umB = (file.unitaDiVendita ?? '').toUpperCase();
  if (umA !== umB) diff.push(`unità di vendita: ${umA || '—'} → ${umB || '—'}`);
  if (!stessoFormato(catalogo, file)) {
    diff.push(
      `formato: ${catalogo.unitSize} ${catalogo.unitOfMeasure} → ${file.unitSize} ${file.unitOfMeasure}`,
    );
  }
  return diff;
}

function variazione(prima: Decimal | null, dopo: Decimal | null): Decimal | null {
  if (!prima || !dopo || prima.lte(0)) return null;
  return dopo.minus(prima).div(prima).mul(100).toDecimalPlaces(2);
}

/** La chiave con cui si cerca l'offerta a catalogo: il codice del fornitore. */
function chiaveCodice(codice: string | null): string | null {
  const pulito = codice?.trim().toUpperCase();
  return pulito ? pulito : null;
}

interface ChiaveIdentita {
  valore: string;
  tipo: 'codice' | 'impronta';
}

/** Il codice vince sempre; l'impronta non deve mai scavalcare un codice reale. */
function chiaveIdentita(identita: Identita): ChiaveIdentita | null {
  const codice = chiaveCodice(identita.supplierCode);
  if (codice) return { valore: `CODICE:${codice}`, tipo: 'codice' };
  const fingerprint = identita.fingerprint?.trim();
  return fingerprint ? { valore: `IMPRONTA:${fingerprint}`, tipo: 'impronta' } : null;
}

/**
 * Confronta il file con ciò che è già a catalogo.
 *
 * Restituisce un `Confronto` per ogni riga del file **e** per ogni offerta a
 * catalogo che nel file non compare più. Nessuna riga sparisce dal risultato:
 * anche «invariato» è un esito, e va contato nel riepilogo.
 */
export interface OpzioniRiconciliazione {
  /**
   * `false` per un **aggiornamento parziale**: il file porta solo alcune
   * righe, e ciò che non c'è non è sparito — semplicemente non è stato
   * rimandato.
   *
   * È l'unica differenza fra le due modalità, e non è una sfumatura: su un
   * foglio da due pagine con i soli rincari, trattarlo come listino completo
   * disattiverebbe le altre trecento offerte del fornitore. Tutto il resto —
   * riconoscimento, aggiornamento del prezzo, creazione dei nuovi — è
   * identico, perché non c'è ragione perché sia diverso.
   */
  segnalaSpariti: boolean;
}

export function riconcilia(
  aCatalogo: readonly OffertaACatalogo[],
  nelFile: readonly RigaDelFile[],
  opzioni: OpzioniRiconciliazione = { segnalaSpariti: true },
): Confronto[] {
  const perIdentita = new Map<string, OffertaACatalogo>();
  for (const offerta of aCatalogo) {
    const chiave = chiaveIdentita(offerta);
    if (chiave) perIdentita.set(chiave.valore, offerta);
  }

  const confronti: Confronto[] = [];
  const visti = new Set<string>();
  const identitaDelFile = new Set<string>();

  for (const riga of nelFile) {
    const chiave = chiaveIdentita(riga);
    const esistente = chiave ? perIdentita.get(chiave.valore) : undefined;

    // Escludere significa «non applicare questa riga», non «il fornitore non
    // vende più questo articolo». La sua presenza nel documento deve quindi
    // impedire SPARITO anche se nessun prezzo o metadato verrà aggiornato.
    if (!riga.inclusa) {
      if (esistente) visti.add(esistente.supplierProductId);
      continue;
    }

    // Lo stesso codice due volte nello stesso file.
    //
    // Succede davvero: il preventivo Barzelli elenca «SC204 angostura BITTER
    // 0.200» due volte. Senza questo controllo si creerebbero due offerte
    // identiche dello stesso fornitore — che poi si confronterebbero fra loro
    // come se fossero di fornitori diversi, e una delle due risulterebbe
    // «più conveniente» dell'altra. Si salta la seconda e la si dichiara.
    if (chiave && identitaDelFile.has(chiave.valore)) {
      confronti.push({
        esito: 'DUPLICATO',
        chiaveRiga: riga.chiave,
        supplierProductId: null,
        differenze: [
          chiave.tipo === 'codice'
            ? `il codice ${riga.supplierCode} compare più volte in questo listino`
            : 'la stessa riga senza codice compare più volte in questo listino',
        ],
        prezzoPrima: null,
        prezzoDopo: riga.prezzoNetto,
        variazionePct: null,
      });
      continue;
    }
    if (chiave) identitaDelFile.add(chiave.valore);

    if (!esistente) {
      confronti.push({
        esito: 'NUOVO',
        chiaveRiga: riga.chiave,
        supplierProductId: null,
        differenze: [],
        prezzoPrima: null,
        prezzoDopo: riga.prezzoNetto,
        variazionePct: null,
      });
      continue;
    }

    visti.add(esistente.supplierProductId);
    const differenze = differenzeFra(esistente, riga);

    if (differenze.length > 0 || !stessaConfezione(esistente, riga)) {
      // Il ramo delicato. Non si decide da soli: aggiornare in silenzio
      // farebbe sembrare un dimezzamento di prezzo quello che è un
      // dimezzamento di confezione, e falserebbe lo storico e ogni confronto
      // futuro. Sono pochi casi per import, e sono quelli in cui sbagliare
      // costa caro.
      confronti.push({
        esito: 'CONFEZIONE_CAMBIATA',
        chiaveRiga: riga.chiave,
        supplierProductId: esistente.supplierProductId,
        differenze,
        prezzoPrima: esistente.prezzoNetto,
        prezzoDopo: riga.prezzoNetto,
        variazionePct: variazione(esistente.prezzoNetto, riga.prezzoNetto),
        nuovaConfezioneApplicabile: stessoFormato(esistente, riga),
      });
      continue;
    }

    const invariato =
      esistente.prezzoNetto !== null &&
      riga.prezzoNetto !== null &&
      esistente.prezzoNetto.equals(riga.prezzoNetto);

    confronti.push({
      // Prezzo identico: non si scrive una riga nello storico. Uno storico
      // pieno di righe uguali non racconta niente e rende illeggibile il
      // grafico.
      esito: invariato ? 'INVARIATO' : 'PREZZO_AGGIORNATO',
      chiaveRiga: riga.chiave,
      supplierProductId: esistente.supplierProductId,
      differenze: [],
      prezzoPrima: esistente.prezzoNetto,
      prezzoDopo: riga.prezzoNetto,
      variazionePct: variazione(esistente.prezzoNetto, riga.prezzoNetto),
    });
  }

  // Ciò che era a catalogo e nel file non c'è più.
  //
  // **Solo** dentro il perimetro (fornitore + copertura), e solo fra le
  // offerte ancora attive: `aCatalogo` arriva già filtrato da chi chiama, ed è
  // lì che il perimetro viene imposto.
  //
  // In un aggiornamento parziale questo giro non si fa proprio: l'assenza di
  // una riga non è un'informazione, e dedurne qualcosa sarebbe inventare.
  if (!opzioni.segnalaSpariti) return confronti;

  for (const offerta of aCatalogo) {
    if (visti.has(offerta.supplierProductId) || !offerta.active) continue;
    confronti.push({
      esito: 'SPARITO',
      chiaveRiga: null,
      supplierProductId: offerta.supplierProductId,
      differenze: [],
      prezzoPrima: offerta.prezzoNetto,
      prezzoDopo: null,
      variazionePct: null,
    });
  }

  return confronti;
}

export interface RiepilogoImport {
  nuovi: number;
  aggiornati: number;
  invariati: number;
  confezioneCambiata: number;
  spariti: number;
  duplicati: number;
  aumentati: number;
  diminuiti: number;
  /** Variazioni oltre la soglia: vanno guardate prima di applicare. */
  anomale: number;
}

/** Oltre questa variazione percentuale, il prezzo va confermato a mano. */
export const VARIAZIONE_ANOMALA_PCT = 40;

export function riepiloga(
  confronti: readonly Confronto[],
  sogliaAnomala: number = VARIAZIONE_ANOMALA_PCT,
): RiepilogoImport {
  const conta = (esito: EsitoRiconciliazione) => confronti.filter((c) => c.esito === esito).length;
  const confezioniRisolte = confronti.filter(
    (c) => c.esito === 'CONFEZIONE_CAMBIATA' && c.confezioneRisolta,
  ).length;
  const variazioni = confronti.filter(
    (c) => c.variazionePct !== null && c.esito === 'PREZZO_AGGIORNATO',
  );

  return {
    nuovi: conta('NUOVO'),
    aggiornati: conta('PREZZO_AGGIORNATO') + confezioniRisolte,
    invariati: conta('INVARIATO'),
    confezioneCambiata: conta('CONFEZIONE_CAMBIATA') - confezioniRisolte,
    spariti: conta('SPARITO'),
    duplicati: conta('DUPLICATO'),
    aumentati: variazioni.filter((c) => c.variazionePct!.gt(0)).length,
    diminuiti: variazioni.filter((c) => c.variazionePct!.lt(0)).length,
    anomale: variazioni.filter((c) => c.variazionePct!.abs().gt(sogliaAnomala)).length,
  };
}
