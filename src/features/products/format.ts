import type { BaseUnitValue, CatalogPrice, PriceBasisValue, SupplierOffer } from './dto';
import type { UnitOfMeasureValue } from './schema';

/**
 * Formattazione per le schermate.
 *
 * Le etichette delle unità sono ripetute qui invece di importarle da
 * `server/domain/packaging`: quel modulo è logica pura e potrebbe girare
 * anche nel browser, ma sta sotto `server/` e importarlo da un componente
 * client renderebbe ambiguo un confine che finora è stato netto. Sono nove
 * stringhe: la duplicazione costa meno dell'ambiguità.
 */

const ETICHETTE_UNITA: Record<UnitOfMeasureValue, string> = {
  PIECE: 'pz',
  MG: 'mg',
  G: 'g',
  HG: 'hg',
  KG: 'kg',
  ML: 'ml',
  CL: 'cl',
  DL: 'dl',
  L: 'L',
};

const ETICHETTE_BASE: Record<BaseUnitValue, string> = {
  PIECE: 'pz',
  KG: 'kg',
  L: 'L',
};

const ETICHETTE_BASIS: Record<PriceBasisValue, string> = {
  PER_PIECE: '€/pz',
  PER_KG: '€/kg',
  PER_L: '€/L',
};

export function etichettaUnita(unita: UnitOfMeasureValue): string {
  return ETICHETTE_UNITA[unita];
}

export function etichettaBase(base: BaseUnitValue): string {
  return ETICHETTE_BASE[base];
}

export function etichettaBasis(basis: PriceBasisValue): string {
  return ETICHETTE_BASIS[basis];
}

/** I decimali arrivano dal database come stringhe: qui diventano leggibili. */
export function numero(valore: string | number, decimaliMax = 3): string {
  const n = typeof valore === 'number' ? valore : Number(valore);
  if (!Number.isFinite(n)) return String(valore);
  return n.toLocaleString('it-IT', { maximumFractionDigits: decimaliMax });
}

export function euro(valore: string | number, decimali = 2): string {
  const n = typeof valore === 'number' ? valore : Number(valore);
  if (!Number.isFinite(n)) return String(valore);
  return n.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  });
}

/** «33 cl» — il formato del singolo pezzo. */
export function formatoUnitario(unitSize: string, unitOfMeasure: UnitOfMeasureValue): string {
  if (unitOfMeasure === 'PIECE' && Number(unitSize) === 1) return 'al pezzo';
  return `${numero(unitSize)} ${etichettaUnita(unitOfMeasure)}`;
}

/** «33 cl × 12» oppure «33 cl» quando la confezione è un pezzo solo. */
export function formatoConfezione(
  unitSize: string,
  unitOfMeasure: UnitOfMeasureValue,
  packQuantity: number,
): string {
  const base = formatoUnitario(unitSize, unitOfMeasure);
  return packQuantity > 1 ? `${base} × ${packQuantity}` : base;
}

/** «3,96 L a confezione» — il contenuto complessivo, in unità base. */
export function contenutoConfezione(contentPerPack: string, baseUnit: BaseUnitValue): string {
  return `${numero(contentPerPack)} ${etichettaBase(baseUnit)}`;
}

/**
 * Quanto costa davvero una confezione: il netto meno il rimborso concordato.
 *
 * Il rimborso non abbassa la fattura — quello si paga per intero — ma abbassa
 * il costo, e il costo è quello su cui si sceglie il fornitore.
 */
export function costoRealeConfezione(offer: SupplierOffer): string | null {
  if (!offer.price) return null;
  const sconto = Number(offer.scontoExtraApplicato);
  if (!Number.isFinite(sconto) || sconto <= 0) return null;
  return ((Number(offer.price.priceNet) * (100 - sconto)) / 100).toFixed(4);
}

/**
 * Il prezzo per unità, oppure il motivo per cui non c'è.
 *
 * ── Sull'effettivo, non sul listino ─────────────────────────────────────
 * È il numero con cui si confrontano due fornitori, quindi deve contenere il
 * rimborso concordato: senza, la stessa schermata diceva due cose opposte —
 * «AD Beverage più conveniente» accanto a un €/L che dava vincente Barzetti.
 * Il succo Amita pesca costa 15,52 € contro 14,88 €, ma con il 5% che torna
 * indietro viene a 14,74 €, e il €/L calcolato sul listino non lo sapeva.
 *
 * Restituire «—» quando la confezione è ignota è deliberato: un numero
 * calcolato su pezzi inventati sarebbe indistinguibile da uno vero.
 */
export function prezzoUnitario(offer: SupplierOffer): string {
  if (!offer.price) return '—';
  if (!offer.packQuantityConfirmed) return 'confezione da definire';
  const sconto = Number(offer.scontoExtraApplicato);
  const unitario =
    Number.isFinite(sconto) && sconto > 0
      ? ((Number(offer.price.unitPrice) * (100 - sconto)) / 100).toFixed(6)
      : offer.price.unitPrice;
  return importoPerUnita(unitario, offer.price.unitPriceBasis);
}

/**
 * «17,0900 €/L» — importo e denominatore, attaccati.
 *
 * In italiano `euro` mette il simbolo in fondo, quindi il denominatore va
 * incollato lì: uno spazio in mezzo si legge «17,0900 € /L», che sembra un
 * refuso e su un elenco di centoquaranta righe lo sembra centoquaranta volte.
 */
function importoPerUnita(valore: string, basis: PriceBasisValue): string {
  return `${euro(valore, 4)}${etichettaBasis(basis).slice(1)}`;
}

/**
 * Le sigle che i listini usano per l'unità di vendita.
 *
 * Si sciolgono solo quelle certe e ricorrenti: «BT» in un listino di bevande
 * è una bottiglia in tutti i listini che abbiamo visto. Tutto il resto resta
 * **come lo scrive il fornitore** — inventare uno scioglimento sbagliato è
 * peggio che mostrare una sigla, perché una sigla si riconosce come tale e una
 * parola sbagliata no.
 */
const SIGLE_CONFEZIONE: Record<string, string> = {
  BT: 'bottiglia',
  CT: 'cartone',
  CF: 'confezione',
  SC: 'scatola',
  PZ: 'pezzo',
  LT: 'latta',
  FU: 'fusto',
  UN: 'unità',
  CO: 'collo',
  CR: 'cassa',
  BA: 'barattolo',
  BU: 'busta',
  SH: 'shopper',
};

export function etichettaImballo(packagingType: string | null): string | null {
  const sigla = packagingType?.trim().toUpperCase();
  if (!sigla) return null;
  return SIGLE_CONFEZIONE[sigla] ?? packagingType!.trim();
}

/**
 * «cartone · 50 cl × 24» — a cosa si riferisce il prezzo netto.
 *
 * Va sempre accanto al prezzo: «4,72 €» da solo non dice se è la bottiglia o
 * il collo, e leggerlo come bottiglia quando è un collo da 24 sbaglia di
 * ventiquattro volte.
 */
export function confezioneDelPrezzo(price: CatalogPrice): string {
  const formato = formatoConfezione(price.unitSize, price.unitOfMeasure, price.packQuantity);
  const imballo = etichettaImballo(price.packagingType);
  return imballo ? `${imballo} · ${formato}` : formato;
}

/** «0,3933 €/L» — il prezzo per unità, quando la confezione lo permette. */
export function prezzoUnitarioDiCatalogo(price: CatalogPrice): string | null {
  if (!price.unitPrice || !price.unitPriceBasis) return null;
  return importoPerUnita(price.unitPrice, price.unitPriceBasis);
}

/** «6% + 10%» — la catena di sconti come la scrive il listino. */
export function catenaSconti(sconti: readonly number[]): string {
  const utili = sconti.filter((s) => Number.isFinite(s) && s > 0);
  return utili.length === 0 ? '—' : utili.map((s) => `${numero(s, 2)}%`).join(' + ');
}

export function dataBreve(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('it-IT');
}

/**
 * Sigle e parole che restano com'erano scritte.
 *
 * Sono di due tipi: **denominazioni** (DOC, IGT, DOP) e **unità o materiali**
 * (CL, PET, VAP). «Doc» e «Igt» in mezzo a un nome sembrano errori di
 * battitura; «Cl» al posto di «CL» sembra un'abbreviazione sbagliata.
 */
const SIGLE = new Set([
  'DOC',
  'DOCG',
  'IGT',
  'IGP',
  'DOP',
  'STG',
  'BIO',
  'VSQ',
  'CL',
  'ML',
  'LT',
  'L',
  'KG',
  'GR',
  'G',
  'PZ',
  'CT',
  'CF',
  'PET',
  'VAP',
  'BT',
  'IPA',
  'APA',
  'XO',
  'VS',
  'VSOP',
  'RTD',
  'GT',
  'DJ',
  'BIB',
]);

/**
 * Il nome di un prodotto, come si legge.
 *
 * ── Perché non si mostra il nome del listino così com'è ─────────────────
 * I listini sono scritti in maiuscolo perché nascono per essere stampati e
 * letti a magazzino: «ABSOLUT CITRON VODKA LITRO». In una card quel
 * maiuscolo occupa più spazio a parità di parole, va a capo prima, e
 * costringe a troncare — sullo schermo si leggeva «ABSOLUT CITRON…», cioè si
 * perdeva proprio la parola che distingue il prodotto.
 *
 * Il maiuscolo si legge anche più lentamente: senza le salite e le discese
 * delle lettere tutte le parole hanno la stessa sagoma rettangolare, e non
 * si riconoscono a colpo d'occhio — che è come si scorre un catalogo.
 *
 * ── Cosa non fa ─────────────────────────────────────────────────────────
 * **Non tocca il dato.** Il nome a database resta quello del fornitore, ed è
 * quello che finisce sull'ordine di acquisto: il PDF che il fornitore riceve
 * deve riportare la sua dicitura, non una nostra versione più bella.
 *
 * Un nome già scritto in modo misto si lascia stare: se qualcuno ha scritto
 * «Amaro dell'Erborista», sa come si scrive meglio di questa funzione.
 */
export function nomeLeggibile(grezzo: string): string {
  // Solo se è tutto maiuscolo: è il segno che nessuno ha scelto quelle
  // maiuscole, le ha messe il gestionale del fornitore.
  //
  // Le note fra parentesi non contano. «ZUBROWKA VODKA BIALA (promoz.)» è
  // un nome urlato con un appunto scritto a mano in coda: guardando la riga
  // intera sembrava già scritta bene, e restava in maiuscolo proprio nei
  // nomi più lunghi — quelli che di spazio ne hanno meno.
  const senzaNote = grezzo.replace(/\([^)]*\)/g, '');
  if (senzaNote !== senzaNote.toUpperCase()) return grezzo;

  return (
    grezzo
      .toLowerCase()
      .replace(/[\p{L}\p{N}']+/gu, (parola) => {
        const su = parola.toUpperCase();
        if (SIGLE.has(su)) return su;
        // Un pezzo che contiene cifre è un formato o un codice: «33x24»,
        // «100ml». Metterci la maiuscola non lo rende più leggibile.
        if (/\d/.test(parola)) return parola;
        return parola.charAt(0).toUpperCase() + parola.slice(1);
      })
      // «S.Benedetto», «A.Camporeale»: la lettera dopo il punto è un'iniziale.
      .replace(
        /(\.)(\p{Ll})/gu,
        (_, punto: string, lettera: string) => punto + lettera.toUpperCase(),
      )
      // «Nero d'Avola»: dopo l'apostrofo comincia un nome. Non dopo quello di
      // «Beck's», dove segue una lettera sola — è un possessivo inglese, non
      // un'elisione italiana, e «Beck'S» non lo scriverebbe nessuno.
      .replace(
        /(['\u2019])(\p{Ll})(\p{L})/gu,
        (_, apice: string, prima: string, dopo: string) => `${apice}${prima.toUpperCase()}${dopo}`,
      )
  );
}
