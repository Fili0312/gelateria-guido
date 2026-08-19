import 'server-only';

import type { DatiProdotto } from './normalizza';

const CATALOGO_JS = 'https://www.adbeverage.it/catalogo.js';
const IDENTITA = 'GelateriaGuido/1.0 (ricerca immagini; contatto via filippo.eventoyou.com)';
const TIMEOUT_MS = 12_000;
const PAGINA = 1_000;
const MASSIMO_PRODOTTI = 10_000;
const CACHE_OK_MS = 6 * 60 * 60 * 1_000;
const CACHE_ERRORE_MS = 15 * 60 * 1_000;

/** La soglia OFF resta separata e invariata a 0,80. */
export const SOGLIA_AD_BEVERAGE = 0.85;
export const SOGLIA_DUBBIA_AD_BEVERAGE = 0.8;

export class AdBeverageError extends Error {
  override readonly name = 'AdBeverageError';
}

export interface ProdottoAdBeverage {
  id: string;
  codice: string | null;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  fotoUrl: string | null;
}

type DimensioneFormato = 'volume' | 'massa';
export interface FormatoAdBeverage {
  /** Millilitri per i volumi, grammi per le masse. */
  base: number;
  dimensione: DimensioneFormato;
  etichetta: string;
}

export interface NomeAdBeverageNormalizzato {
  testo: string;
  parole: readonly string[];
  formato: FormatoAdBeverage | null;
  contenitori: ReadonlySet<string>;
}

export interface EsitoMatchAdBeverage {
  prodotto: ProdottoAdBeverage | null;
  confidenza: number;
  accettato: boolean;
  dubbio: boolean;
  motivo: string;
  formatoLocale: string | null;
  formatoAd: string | null;
}

export interface CandidatoAdBeverage {
  prodotto: ProdottoAdBeverage;
  /** Capacità del filtro lessicale di portare il prodotto davanti al modello. */
  richiamo: number;
  valutazione: EsitoMatchAdBeverage;
}

const PAROLE_RUMORE = new Set([
  'ad',
  'adb',
  'assodrink',
  'ass0drink',
  'off',
  'offerta',
  'promo',
  'promoz',
  'promozione',
  'base',
  'nuovo',
  'nuova',
  'new',
  'prezzo',
  'telefono',
  'tel',
  'mess',
  'messaggio',
  'fattura',
  'inviato',
  'inviata',
  'ancora',
  'sostituzione',
  'sostituz',
  'ordinare',
  'piu',
  'non',
  'a',
  'al',
  'alla',
  'alle',
  'da',
  'dal',
  'dalla',
  'de',
  'del',
  'della',
  'delle',
  'di',
  'e',
  'in',
  'la',
  'le',
  'lo',
  'o',
  'per',
  'the',
  'un',
  'una',
  'x',
]);

/** Descrivono il tipo del prodotto, non la variante. */
const PAROLE_CATEGORIA = new Set([
  'acqua',
  'alcolico',
  'alcolici',
  'amaro',
  'analcolico',
  'aperitivo',
  'bevanda',
  'bevande',
  'birra',
  'bitter',
  'brandy',
  'cachaca',
  'champagne',
  'cognac',
  'gin',
  'grappa',
  'liquore',
  'mezcal',
  'rhum',
  'ron',
  'rum',
  'sciroppo',
  'spirit',
  'spirits',
  'spumante',
  'succo',
  'tequila',
  'vermouth',
  'vino',
  'vodka',
  'whiskey',
  'whisky',
]);
const PAROLE_DEBOLI = new Set(['dry', 'london', 'prodotto', 'regular', 'russian', 'vintage']);

const ALIAS: Readonly<Record<string, string>> = {
  arancia: 'orange',
  bianca: 'bianco',
  blanco: 'bianco',
  campagne: 'champagne',
  disaronno: 'saronno',
  fr: 'gassata',
  friz: 'gassata',
  gass: 'gassata',
  gas: 'gassata',
  latt: 'lattina',
  lat: 'lattina',
  nat: 'naturale',
  red: 'rosso',
  rossa: 'rosso',
  rouge: 'rosso',
  vanilia: 'vaniglia',
  vanilla: 'vaniglia',
  white: 'bianco',
};

const CONTENITORI: Readonly<Record<string, string>> = {
  ast: 'astuccio',
  astuccio: 'astuccio',
  barattolo: 'lattina',
  lattina: 'lattina',
  lattine: 'lattina',
  lat: 'lattina',
  bott: 'bottiglia',
  bottiglia: 'bottiglia',
  bottiglie: 'bottiglia',
  bt: 'bottiglia',
  pet: 'bottiglia',
  tc: 'bottiglia',
  tv: 'bottiglia',
  vap: 'bottiglia',
  var: 'bottiglia',
  brick: 'brick',
  brik: 'brick',
  fusto: 'fusto',
  fus: 'fusto',
  postmix: 'postmix',
  premix: 'premix',
};

function numero(testo: string): number | null {
  const valore = Number(testo.replace(',', '.'));
  return Number.isFinite(valore) && valore > 0 ? valore : null;
}

function etichettaNumero(valore: number): string {
  return Number.isInteger(valore) ? String(valore) : String(valore).replace(/\.0+$/, '');
}

function creaFormato(quantita: number, unitaGrezza: string): FormatoAdBeverage | null {
  const unita = unitaGrezza.toLowerCase().replace(/\.$/, '');
  const volume: Readonly<Record<string, number>> = {
    l: 1_000,
    lt: 1_000,
    litro: 1_000,
    litri: 1_000,
    dl: 100,
    cl: 10,
    ml: 1,
    cc: 1,
  };
  const massa: Readonly<Record<string, number>> = {
    kg: 1_000,
    chilo: 1_000,
    chili: 1_000,
    hg: 100,
    g: 1,
    gr: 1,
    grammi: 1,
    mg: 0.001,
  };
  const fattoreVolume = volume[unita];
  const fattoreMassa = massa[unita];
  if (!fattoreVolume && !fattoreMassa) return null;
  const base = quantita * (fattoreVolume ?? fattoreMassa!);
  const dimensione: DimensioneFormato = fattoreVolume ? 'volume' : 'massa';
  const etichetta =
    dimensione === 'volume'
      ? base >= 1_000
        ? `${etichettaNumero(base / 1_000)} L`
        : base >= 100 && base % 10 === 0
          ? `${etichettaNumero(base / 10)} cl`
          : `${etichettaNumero(base)} ml`
      : base >= 1_000
        ? `${etichettaNumero(base / 1_000)} kg`
        : `${etichettaNumero(base)} g`;
  return { base, dimensione, etichetta };
}

/** Riconosce `70 CL`, `CL.70` e, nei beverage, `33X24` come 33 cl. */
export function estraiFormatoAdBeverage(testo: string): FormatoAdBeverage | null {
  const pulito = testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ');
  const unita = 'litri?|lt|dl|cl|ml|cc|chili?|chilo|kg|hg|grammi|gr|mg|g|l';
  const primaUnita = new RegExp(
    `\\b(${unita})\\s*\\.?\\s*(\\d+(?:[.,]\\d+)?)(?=\\s|[x×]|$)`,
    'i',
  ).exec(pulito);
  if (primaUnita) {
    const quantita = numero(primaUnita[2]!);
    if (quantita) return creaFormato(quantita, primaUnita[1]!);
  }
  const primaQuantita = new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${unita})\\b\\.?`, 'i').exec(pulito);
  if (primaQuantita) {
    const quantita = numero(primaQuantita[1]!);
    if (quantita) return creaFormato(quantita, primaQuantita[2]!);
  }
  const collo = /\b(\d{1,3}(?:[.,]\d+)?)\s*[x×]\s*\d+\b/i.exec(pulito);
  if (collo) {
    const quantita = numero(collo[1]!);
    if (quantita && quantita <= 200) return creaFormato(quantita, 'cl');
  }
  if (/\b(?:litro|lt\.?)\b/i.test(pulito)) return creaFormato(1, 'l');
  return null;
}

/** Toglie rumore commerciale mantenendo annata, eta', variante e formato. */
export function normalizzaAdBeverage(testo: string): NomeAdBeverageNormalizzato {
  const formato = estraiFormatoAdBeverage(testo);
  const base = testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:ancora\s+in\s+)?promoz(?:ione)?\b/g, ' ')
    .replace(/\b(?:in\s+)?sostituz(?:ione)?\b.*$/g, ' ')
    .replace(/\bnon\s+(?:la\s+)?(?:tiene|ordinare)\s+piu\b.*$/g, ' ')
    .replace(/\bprezzo\s+(?:errato|litro)\b.*$/g, ' ')
    .replace(/\b(?:tel|telefono)\.?\s*\+?[\d\s/-]{6,}\b/g, ' ')
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})\b/g, ' ')
    // Date operative via; annata e eta' sono invece identita' prodotto.
    .replace(/\b(\d{1,2})\s*(?:y(?:\.?\s*o\.?)?|anni?)\b/g, ' eta$1 ')
    .replace(/\b((?:19|20)\d{2})\b/g, ' annata$1 ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:%|°|gradi\b|vol\b)/g, ' ')
    .replace(
      /\b(?:litri?|lt|dl|cl|ml|cc|chili?|chilo|kg|hg|grammi|gr|mg|g|l)\s*\.?\s*\d+(?:[.,]\d+)?(?=\s|[x×]|$)/g,
      ' ',
    )
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:litri?|lt|dl|cl|ml|cc|chili?|chilo|kg|hg|grammi|gr|mg|g|l)\b\.?/g,
      ' ',
    )
    .replace(/\b(?:litro|litri|lt)\b\.?/g, ' ')
    .replace(/\b(pet|lat|vap|var|fus|fusto|brick|brik)[x×]\s*\d+\b/g, ' $1 ')
    .replace(/\b\d+\s*[x×]\s*\d+\b/g, ' ')
    .replace(/\b[x×]\s*\d+\b/g, ' ')
    .replace(/\bsugar\s+free\b/g, ' sugarfree ')
    .replace(/\bsenza\s+zucchero\b/g, ' sugarfree ')
    .replace(/[^a-z0-9\s]/g, ' ');
  const grezze = base.split(/\s+/).filter(Boolean);
  const contenitori = new Set<string>();
  for (const parola of grezze) {
    const contenitore = CONTENITORI[parola];
    if (contenitore) contenitori.add(contenitore);
  }
  const parole = grezze
    .filter((p) => !PAROLE_RUMORE.has(p) && !CONTENITORI[p] && p.length > 1 && !/^\d+$/.test(p))
    .map((p) => ALIAS[p] ?? p);
  return { testo: parole.join(' '), parole, formato, contenitori };
}

function formatoDaDati(prodotto: DatiProdotto): FormatoAdBeverage | null {
  const quantita = Number(prodotto.unitSize);
  const unita = prodotto.unitOfMeasure?.trim();
  if (Number.isFinite(quantita) && quantita > 0 && unita && unita !== 'PIECE') {
    const formato = creaFormato(quantita, unita);
    if (formato) return formato;
  }
  return estraiFormatoAdBeverage(prodotto.name);
}

function distanza(a: string, b: string): number {
  if (a === b) return 0;
  let prima = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const corrente = [i];
    for (let j = 1; j <= b.length; j += 1) {
      corrente[j] = Math.min(
        corrente[j - 1]! + 1,
        prima[j]! + 1,
        prima[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prima = corrente;
  }
  return prima[b.length]!;
}

function stessaParola(a: string, b: string): boolean {
  // La tolleranza di un carattere serve ai refusi alfabetici (Chartreus /
  // Chartreuse), mai a codici, eta' o annate: 2012 e 2013 sono due prodotti.
  return (
    a === b ||
    (/^[a-z]+$/.test(a) &&
      /^[a-z]+$/.test(b) &&
      a.length >= 6 &&
      b.length >= 6 &&
      distanza(a, b) <= 1)
  );
}
function similaritaParolaFuzzy(a: string, b: string): number {
  if (stessaParola(a, b)) return 1;
  if (/\d/.test(a) || /\d/.test(b)) return 0;
  const massimo = Math.max(a.length, b.length);
  return massimo < 4 ? 0 : Math.max(0, 1 - distanza(a, b) / massimo);
}
function tutteCoperte(a: readonly string[], b: readonly string[]): boolean {
  return a.every((x) => b.some((y) => stessaParola(x, y)));
}
function uniche(a: readonly string[]): string[] {
  return [...new Set(a)];
}
function paroleMarca(marca: string | null | undefined): string[] {
  return marca ? uniche(normalizzaAdBeverage(marca).parole) : [];
}
function paroleVariante(n: NomeAdBeverageNormalizzato, marca: readonly string[]): string[] {
  return uniche(
    n.parole.filter(
      (p) =>
        !marca.some((m) => stessaParola(p, m)) && !PAROLE_CATEGORIA.has(p) && !PAROLE_DEBOLI.has(p),
    ),
  );
}
function variantiUguali(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && tutteCoperte(a, b) && tutteCoperte(b, a);
}
function similarita(a: readonly string[], b: readonly string[]): number {
  const prime = uniche(a);
  const seconde = uniche(b);
  if (!prime.length || !seconde.length) return 0;
  const comuni = prime.filter((p) => seconde.some((s) => stessaParola(p, s))).length;
  return (2 * comuni) / (prime.length + seconde.length);
}

function famigliaCategoria(testo: string | null | undefined): string | null {
  const parole = new Set(normalizzaAdBeverage(testo ?? '').parole);
  if (parole.has('acqua') || parole.has('acque')) return 'acqua';
  if (['vino', 'vini', 'spumante', 'champagne', 'prosecco'].some((p) => parole.has(p)))
    return 'vino';
  if (parole.has('birra') || parole.has('birre')) return 'birra';
  if (
    ['analcolico', 'bevanda', 'bevande', 'bibita', 'bibite', 'succo', 'sciroppo', 'the'].some((p) =>
      parole.has(p),
    )
  )
    return 'bevanda';
  if ([...PAROLE_CATEGORIA].some((p) => parole.has(p))) return 'spirits';
  return null;
}
function formatiUguali(a: FormatoAdBeverage, b: FormatoAdBeverage): boolean {
  return (
    a.dimensione === b.dimensione && Math.max(a.base, b.base) / Math.min(a.base, b.base) <= 1.02
  );
}
function contenitoriCompatibili(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return !a.size || !b.size || [...a].some((x) => b.has(x));
}
function arrotonda(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1_000) / 1_000));
}

function contiene(parole: readonly string[], ...richieste: string[]): boolean {
  return richieste.every((richiesta) => parole.includes(richiesta));
}

/**
 * Equivalenze commerciali verificate sul listino locale e sul catalogo AD.
 * Restano volutamente strette: servono per denominazioni ufficiali diverse,
 * non per rendere intercambiabili marche, gusti o linee somiglianti.
 */
function equivalenzaFotoVerificata(
  locale: NomeAdBeverageNormalizzato,
  ad: NomeAdBeverageNormalizzato,
): string | null {
  if (
    contiene(locale.parole, 'batida', 'coco') &&
    contiene(ad.parole, 'mangaroca', 'batida', 'coco')
  ) {
    return 'Batida de Coco / Mangaroca Batida de Coco';
  }
  if (
    contiene(locale.parole, 'sciroppo', 'passion', 'fruit', 'odk') &&
    contiene(ad.parole, 'sciroppo', 'orsa', 'drinks', 'passion', 'fruit')
  ) {
    return 'ODK / Orsa Drinks Passion Fruit';
  }
  if (
    contiene(locale.parole, 'zacapa', 'centenario', 'eta23') &&
    contiene(ad.parole, 'zacapa', 'solera', 'gran', 'reserva')
  ) {
    return 'Zacapa Centenario 23 / Solera Gran Reserva';
  }
  return null;
}

/** Marca, variante, formato e contenitore sono porte, non bonus compensabili. */
export function matchAdBeverageProduct(
  locale: DatiProdotto,
  ad: ProdottoAdBeverage,
): EsitoMatchAdBeverage {
  const nl = normalizzaAdBeverage(locale.name);
  const na = normalizzaAdBeverage(ad.nome);
  const fl = formatoDaDati(locale) ?? nl.formato;
  const fa = na.formato;
  const marca = paroleMarca(locale.brand);
  const som = similarita(nl.parole, na.parole);
  const cl = famigliaCategoria(locale.categoria);
  const ca = famigliaCategoria(ad.categoria);
  const base = {
    prodotto: ad,
    dubbio: false,
    formatoLocale: fl?.etichetta ?? null,
    formatoAd: fa?.etichetta ?? null,
  };
  const equivalenzaVerificata = equivalenzaFotoVerificata(nl, na);
  if (equivalenzaVerificata) {
    return {
      ...base,
      confidenza: 0.97,
      accettato: true,
      motivo: `equivalenza foto AD verificata: ${equivalenzaVerificata}`,
    };
  }
  if (marca.length && !tutteCoperte(marca, na.parole)) {
    return {
      ...base,
      confidenza: arrotonda(som * 0.2),
      accettato: false,
      motivo: `marca diversa: manca «${marca.join(' ')}»`,
    };
  }
  const vl = paroleVariante(nl, marca);
  const va = paroleVariante(na, marca);
  if (!marca.length && vl.length < 2) {
    return {
      ...base,
      confidenza: arrotonda(som * 0.45),
      accettato: false,
      motivo: 'nome senza marca troppo generico per essere verificato',
    };
  }
  if (!variantiUguali(vl, va)) {
    const confidenza = arrotonda(
      (marca.length ? 0.35 : 0.15) + som * 0.2 + (fl && fa && formatiUguali(fl, fa) ? 0.1 : 0),
    );
    return {
      ...base,
      confidenza,
      accettato: false,
      dubbio: confidenza >= SOGLIA_DUBBIA_AD_BEVERAGE,
      motivo: `variante diversa (${vl.join(' ') || 'base'} / ${va.join(' ') || 'base'})`,
    };
  }
  if (!contenitoriCompatibili(nl.contenitori, na.contenitori)) {
    return {
      ...base,
      confidenza: 0.79,
      accettato: false,
      motivo: `confezione diversa (${[...nl.contenitori].join(', ')} / ${[...na.contenitori].join(', ')})`,
    };
  }
  if (fl && fa && !formatiUguali(fl, fa)) {
    return {
      ...base,
      confidenza: 0.79,
      accettato: false,
      motivo: `formato diverso (${fl.etichetta} / ${fa.etichetta})`,
    };
  }
  if (cl && ca && cl !== ca) {
    return {
      ...base,
      confidenza: 0.3,
      accettato: false,
      motivo: `categoria diversa (${locale.categoria ?? '-'} / ${ad.categoria ?? '-'})`,
    };
  }
  let confidenza = 0.35 + 0.25 + (fl && fa ? 0.2 : 0.08) + som * 0.15 + (cl && ca ? 0.05 : 0.025);
  confidenza = arrotonda(confidenza);
  const accettato = confidenza >= SOGLIA_AD_BEVERAGE;
  return {
    ...base,
    confidenza,
    accettato,
    dubbio: !accettato && confidenza >= SOGLIA_DUBBIA_AD_BEVERAGE,
    motivo: [
      marca.length ? 'marca esatta' : 'nome distintivo esatto',
      'variante coerente',
      fl && fa ? 'formato uguale' : 'formato non verificabile',
      cl && ca ? 'categoria coerente' : 'categoria non verificabile',
    ].join(', '),
  };
}

function stessaIdentita(a: ProdottoAdBeverage, b: ProdottoAdBeverage): boolean {
  const x = normalizzaAdBeverage(a.nome);
  const y = normalizzaAdBeverage(b.nome);
  return (
    x.testo === y.testo &&
    x.formato?.dimensione === y.formato?.dimensione &&
    x.formato?.base === y.formato?.base
  );
}

/** Esamina tutto il catalogo e non si fida del suo ordine. */
export function trovaMiglioreAdBeverage(
  locale: DatiProdotto,
  catalogo: readonly ProdottoAdBeverage[],
): EsitoMatchAdBeverage {
  const classificati = catalogo
    .map((p) => matchAdBeverageProduct(locale, p))
    .sort((a, b) => b.confidenza - a.confidenza);
  const migliore = classificati[0];
  if (!migliore?.prodotto)
    return {
      prodotto: null,
      confidenza: 0,
      accettato: false,
      dubbio: false,
      motivo: 'catalogo AD Beverage non disponibile o vuoto',
      formatoLocale: formatoDaDati(locale)?.etichetta ?? null,
      formatoAd: null,
    };
  const seconda = classificati[1];
  if (
    migliore.accettato &&
    seconda?.prodotto &&
    migliore.confidenza - seconda.confidenza < 0.025 &&
    !stessaIdentita(migliore.prodotto, seconda.prodotto)
  ) {
    return {
      ...migliore,
      accettato: false,
      dubbio: true,
      motivo: `ambiguo con «${seconda.prodotto.nome}» (${seconda.confidenza.toFixed(2)})`,
    };
  }
  return migliore;
}

/**
 * Recupero permissivo per DeepSeek.
 *
 * Qui il punteggio non decide il match: serve soltanto a ridurre 2.000 nomi
 * a un elenco corto che il modello possa leggere. Per questo tollera refusi
 * più ampi e non chiude la porta su formato o confezione differenti.
 */
export function selezionaCandidatiAdBeverage(
  locale: DatiProdotto,
  catalogo: readonly ProdottoAdBeverage[],
  massimo = 10,
): CandidatoAdBeverage[] {
  const nl = normalizzaAdBeverage(locale.name);
  const marca = paroleMarca(locale.brand);
  const paroleLocale = uniche([...nl.parole, ...marca]);
  const formatoLocale = formatoDaDati(locale) ?? nl.formato;
  const categoriaLocale = famigliaCategoria(locale.categoria);

  return catalogo
    .filter((prodotto) => estraiImmagineAdBeverage(prodotto) !== null)
    .map((prodotto): CandidatoAdBeverage => {
      const na = normalizzaAdBeverage(prodotto.nome);
      const paroleAd = uniche(na.parole);
      const copertura = paroleLocale.length
        ? paroleLocale.reduce(
            (somma, parola) =>
              somma + Math.max(0, ...paroleAd.map((altra) => similaritaParolaFuzzy(parola, altra))),
            0,
          ) / paroleLocale.length
        : 0;
      const precisione = paroleAd.length
        ? paroleAd.reduce(
            (somma, parola) =>
              somma +
              Math.max(0, ...paroleLocale.map((altra) => similaritaParolaFuzzy(parola, altra))),
            0,
          ) / paroleAd.length
        : 0;
      const formatoAd = na.formato;
      const categoriaAd = famigliaCategoria(prodotto.categoria);
      let richiamo = copertura * 0.62 + precisione * 0.18;
      if (marca.length && tutteCoperte(marca, na.parole)) richiamo += 0.12;
      if (formatoLocale && formatoAd) {
        richiamo += formatiUguali(formatoLocale, formatoAd) ? 0.12 : -0.04;
      }
      if (categoriaLocale && categoriaAd) {
        richiamo += categoriaLocale === categoriaAd ? 0.08 : -0.12;
      }
      const valutazione = matchAdBeverageProduct(locale, prodotto);
      richiamo += valutazione.confidenza * 0.08;
      return { prodotto, richiamo: arrotonda(richiamo), valutazione };
    })
    .sort((a, b) => b.richiamo - a.richiamo || b.valutazione.confidenza - a.valutazione.confidenza)
    .slice(0, Math.max(1, massimo));
}

interface ConfigurazioneSupabase {
  url: string;
  chiaveAnonima: string;
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
async function richiedi(url: string, init: RequestInit = {}): Promise<Response> {
  let ultimo: unknown = null;
  for (let tentativo = 0; tentativo < 2; tentativo += 1) {
    try {
      const headers = new Headers(init.headers);
      headers.set('User-Agent', IDENTITA);
      const risposta = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (risposta.status === 429 || risposta.status >= 500) {
        ultimo = new AdBeverageError(`AD Beverage ha risposto ${risposta.status}.`);
        continue;
      }
      return risposta;
    } catch (errore) {
      ultimo = errore;
    }
  }
  throw new AdBeverageError(
    `AD Beverage non raggiungibile: ${ultimo instanceof Error ? ultimo.message : 'errore di rete'}`,
  );
}
async function configurazioneSupabase(): Promise<ConfigurazioneSupabase> {
  const risposta = await richiedi(CATALOGO_JS, { headers: { Accept: 'text/javascript' } });
  if (!risposta.ok) throw new AdBeverageError(`catalogo.js ha risposto ${risposta.status}.`);
  const script = await risposta.text();
  const url = /SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(script)?.[1];
  const chiaveAnonima = /SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/.exec(script)?.[1];
  if (!url || !chiaveAnonima)
    throw new AdBeverageError('configurazione Supabase non trovata in catalogo.js.');
  const indirizzo = new URL(url);
  if (indirizzo.protocol !== 'https:' || !indirizzo.hostname.endsWith('.supabase.co'))
    throw new AdBeverageError('endpoint Supabase AD Beverage non valido.');
  return { url: indirizzo.origin, chiaveAnonima };
}
function leggiProdotto(v: unknown): ProdottoAdBeverage | null {
  if (!record(v) || typeof v.id !== 'string' || typeof v.nome !== 'string') return null;
  const opt = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  return {
    id: v.id,
    codice: opt(v.codice),
    nome: v.nome.trim(),
    categoria: opt(v.categoria),
    descrizione: opt(v.descrizione),
    fotoUrl: opt(v.foto_url),
  };
}

/** Paginazione a lotti: mai una richiesta remota per singolo prodotto. */
export async function caricaCatalogoAdBeverage(): Promise<ProdottoAdBeverage[]> {
  const config = await configurazioneSupabase();
  const prodotti: ProdottoAdBeverage[] = [];
  for (let da = 0; da < MASSIMO_PRODOTTI; da += PAGINA) {
    const url = new URL('/rest/v1/prodotti', config.url);
    url.searchParams.set('select', 'id,codice,nome,categoria,descrizione,foto_url');
    url.searchParams.set('attivo', 'eq.true');
    url.searchParams.set('order', 'nome.asc');
    const risposta = await richiedi(url.toString(), {
      headers: {
        Accept: 'application/json',
        apikey: config.chiaveAnonima,
        Authorization: `Bearer ${config.chiaveAnonima}`,
        Range: `${da}-${da + PAGINA - 1}`,
      },
    });
    if (!risposta.ok) throw new AdBeverageError(`API catalogo ha risposto ${risposta.status}.`);
    const corpo: unknown = await risposta.json();
    if (!Array.isArray(corpo)) throw new AdBeverageError('risposta catalogo non valida.');
    prodotti.push(...corpo.map(leggiProdotto).filter((p): p is ProdottoAdBeverage => p !== null));
    if (corpo.length < PAGINA) return prodotti;
  }
  throw new AdBeverageError(`catalogo oltre il limite prudenziale di ${MASSIMO_PRODOTTI} righe.`);
}

let cache: { finoA: number; prodotti: readonly ProdottoAdBeverage[] } | null = null;
let caricamento: Promise<readonly ProdottoAdBeverage[]> | null = null;
export async function catalogoAdBeverageConCache(): Promise<readonly ProdottoAdBeverage[]> {
  if (cache && cache.finoA > Date.now()) return cache.prodotti;
  if (caricamento) return caricamento;
  caricamento = caricaCatalogoAdBeverage()
    .then((prodotti) => {
      cache = { finoA: Date.now() + CACHE_OK_MS, prodotti };
      return prodotti;
    })
    .catch((errore: unknown) => {
      console.error('Catalogo AD Beverage non disponibile; uso Open Food Facts:', errore);
      cache = { finoA: Date.now() + CACHE_ERRORE_MS, prodotti: [] };
      return [];
    })
    .finally(() => {
      caricamento = null;
    });
  return caricamento;
}

/**
 * Il prodotto locale e la scheda condividono almeno **una parola che
 * identifica**: non di categoria, non di quelle deboli.
 *
 * ── Perché serve, e perché sta qui ──────────────────────────────────────
 * È il freno di sicurezza sul giudizio del modello. Quando il prodotto non
 * sta nel catalogo AD, i candidati che gli arrivano sono dieci articoli
 * della stessa famiglia e di marche diverse: DeepSeek a volte ne sceglie
 * uno lo stesso, con una motivazione convincente. È successo davvero —
 * «GINARTE DISTILLED DRY GIN» ha ricevuto la foto di «GIN SIPSMITH LONDON
 * DRY», con scritto «corrisponde al candidato Gin Arte», che nel catalogo
 * non esiste.
 *
 * Il controllo è volutamente **debole**: basta una parola in comune, con la
 * tolleranza di un carattere per i refusi. Non deve rifare il lavoro del
 * confronto — deve solo impedire che una scheda senza *niente* in comune
 * passi perché qualcuno ne ha parlato bene. «Amaretto di Saronno» e
 * «Amaretto Disaronno» condividono «amaretto»; «Ginarte» e «Sipsmith» non
 * condividono niente, ed è tutto quello che serve sapere.
 */
export function condivideParolaIdentificativa(locale: string, candidato: string): boolean {
  const identificative = (testo: string) =>
    normalizzaAdBeverage(testo).parole.filter(
      (p) => !PAROLE_CATEGORIA.has(p) && !PAROLE_DEBOLI.has(p),
    );

  const nostre = identificative(locale);
  // Nessuna parola propria: non c'è niente da verificare, e quando non si
  // può verificare non si associa.
  if (nostre.length === 0) return false;
  const loro = identificative(candidato);
  return nostre.some((nostra) => loro.some((suo) => stessoNome(nostra, suo)));
}

/**
 * Due parole che nominano la stessa cosa, con tre tolleranze misurate su
 * casi veri di questo catalogo.
 *
 *  - **Refuso**: `stessaParola` perdona un carattere — «Chartreus» /
 *    «Chartreuse».
 *  - **Attaccato o staccato**: «SAN PELLEGRINO» da noi, «SANPELLEGRINO»
 *    da loro. Una parola dentro l'altra, purché la più corta sia lunga
 *    almeno cinque lettere — sotto quella misura «gin» starebbe dentro
 *    «ginarte» e la protezione si aprirebbe da sola.
 *  - **Coda diversa**: «BUSHMILSS» e «BUSHMILL S», che condividono le
 *    prime sette lettere ma distano due caratteri.
 */
function stessoNome(a: string, b: string): boolean {
  if (stessaParola(a, b)) return true;
  const [corta, lunga] = a.length <= b.length ? [a, b] : [b, a];
  // Solo fra parole di lettere: su numeri, annate ed età la somiglianza non
  // vuol dire niente — «2012» dentro «2012 2013» sarebbe un caso, e 903 e
  // 9030 sono due prodotti.
  if (!/^[a-z]+$/.test(corta) || !/^[a-z]+$/.test(lunga)) return false;
  if (corta.length >= 5 && lunga.includes(corta)) return true;
  let comuni = 0;
  while (comuni < corta.length && corta[comuni] === lunga[comuni]) comuni += 1;
  return comuni >= 6;
}

export function isFornitoreAdBeverage(nome: string): boolean {
  const pulito = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return pulito === 'adbeverage' || pulito === 'adbspa';
}
export async function cercaAdBeverage(locale: DatiProdotto): Promise<EsitoMatchAdBeverage> {
  return trovaMiglioreAdBeverage(locale, await catalogoAdBeverageConCache());
}

/** Solo host ufficiali: il catalogo remoto non diventa un vettore SSRF. */
export function estraiImmagineAdBeverage(prodotto: ProdottoAdBeverage): string | null {
  if (!prodotto.fotoUrl) return null;
  try {
    const url = new URL(prodotto.fotoUrl);
    const ufficiale =
      url.hostname === 'adbeverage.it' ||
      url.hostname === 'www.adbeverage.it' ||
      (url.hostname.endsWith('.supabase.co') &&
        url.pathname.startsWith('/storage/v1/object/public/prodotti-foto/'));
    return url.protocol === 'https:' && ufficiale ? url.toString() : null;
  } catch {
    return null;
  }
}
export async function scaricaImmagineAdBeverage(
  prodotto: ProdottoAdBeverage,
  massimoByte = 2_000_000,
): Promise<{ dati: Uint8Array; tipo: string } | null> {
  const url = estraiImmagineAdBeverage(prodotto);
  if (!url) return null;
  try {
    const risposta = await richiedi(url, { headers: { Accept: 'image/*' } });
    if (!risposta.ok) return null;
    const tipo = risposta.headers.get('content-type') ?? '';
    if (!tipo.startsWith('image/')) return null;
    const dati = new Uint8Array(await risposta.arrayBuffer());
    return !dati.byteLength || dati.byteLength > massimoByte ? null : { dati, tipo };
  } catch {
    return null;
  }
}
