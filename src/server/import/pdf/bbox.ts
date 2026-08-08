/**
 * Il testo del PDF con le coordinate, letto da `pdftotext -bbox-layout`.
 *
 * Questo modulo è **puro**: prende l'XML e restituisce parole con posizione.
 * Chi lancia poppler sta in `extract-text.ts`. La separazione serve a poter
 * provare la segmentazione sui listini veri senza eseguire un processo
 * esterno, che è la parte che nei test rende tutto lento e fragile.
 *
 * Perché le coordinate e non solo `-layout`. Il testo allineato con gli spazi
 * è comodo da leggere ma è già una **interpretazione**: poppler decide quanti
 * spazi mettere, e due colonne vicine possono fondersi in una. Le x dicono
 * dove stanno davvero le colonne, ed è l'unico modo per distinguere «la
 * descrizione continua qui sotto» da «questa è una riga nuova» — che nei
 * listini di Cecconi è la differenza fra 189 prodotti e 250 righe di spazzatura.
 */

export interface Parola {
  testo: string;
  /** Coordinate in punti tipografici, origine in alto a sinistra. */
  x: number;
  y: number;
  xFine: number;
  yFine: number;
}

export interface PaginaParole {
  /** 1-based, come la numerazione che vede l'utente. */
  numero: number;
  larghezza: number;
  altezza: number;
  parole: Parola[];
}

/** Quello che poppler dichiara su chi ha prodotto il file. */
export interface MetadatiPdf {
  titolo: string | null;
  autore: string | null;
  creatore: string | null;
  produttore: string | null;
}

export interface DocumentoParole {
  pagine: PaginaParole[];
  metadati: MetadatiPdf;
}

const RE_PAGINA = /<page\b[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"[^>]*>/g;
const RE_PAROLA =
  /<word\s+xMin="([-\d.]+)"\s+yMin="([-\d.]+)"\s+xMax="([-\d.]+)"\s+yMax="([-\d.]+)"\s*>([\s\S]*?)<\/word>/g;
const RE_META = /<meta\s+name="([^"]+)"\s+content="([^"]*)"/g;

/**
 * Le entità che poppler emette. Sono cinque e sempre le stesse: una tabella
 * esplicita costa meno di una dipendenza per fare `decodeEntities`, e non
 * introduce comportamenti che qui non servono (entità numeriche esotiche,
 * tolleranza all'XML malformato).
 */
const ENTITA: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodifica(grezzo: string): string {
  return grezzo
    .replace(/&(amp|lt|gt|quot|apos);/g, (intero) => ENTITA[intero] ?? intero)
    .replace(/&#(\d+);/g, (_, codice: string) => String.fromCodePoint(Number(codice)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, codice: string) => String.fromCodePoint(parseInt(codice, 16)));
}

function testaMetadati(xml: string): MetadatiPdf {
  const trovati = new Map<string, string>();
  for (const m of xml.matchAll(RE_META)) trovati.set(m[1]!, decodifica(m[2]!));
  const titolo = /<title>([\s\S]*?)<\/title>/.exec(xml)?.[1];
  return {
    titolo: titolo ? decodifica(titolo).trim() || null : null,
    autore: trovati.get('Author') ?? null,
    creatore: trovati.get('Creator') ?? null,
    produttore: trovati.get('Producer') ?? null,
  };
}

/**
 * Trasforma l'XML di `-bbox-layout` in pagine di parole.
 *
 * Si legge con espressioni regolari e non con un parser XML: il formato è
 * generato da poppler, ha tre tag e non cambia da vent'anni, e un parser
 * completo su 650 KB di markup costerebbe più di quanto valga. Il rischio
 * vero — che il testo di una parola contenga `<` — è coperto: il contenuto
 * arriva già come entità.
 */
export function leggiBbox(xml: string): DocumentoParole {
  const pagine: PaginaParole[] = [];

  // Si spezza sull'apertura dei tag <page>, così ogni pezzo contiene le sole
  // parole di quella pagina e non serve tenere uno stato durante la scansione.
  const aperture = [...xml.matchAll(RE_PAGINA)];
  for (const [indice, apertura] of aperture.entries()) {
    const inizio = apertura.index + apertura[0].length;
    const fine = aperture[indice + 1]?.index ?? xml.length;
    const corpo = xml.slice(inizio, fine);

    const parole: Parola[] = [];
    for (const m of corpo.matchAll(RE_PAROLA)) {
      const testo = decodifica(m[5]!);
      // Una parola tutta spazi non è una parola: poppler ne emette qualcuna
      // e conteggiarla sposterebbe i confini delle colonne.
      if (!testo.trim()) continue;
      parole.push({
        testo,
        x: Number(m[1]),
        y: Number(m[2]),
        xFine: Number(m[3]),
        yFine: Number(m[4]),
      });
    }

    pagine.push({
      numero: indice + 1,
      larghezza: Number(apertura[1]),
      altezza: Number(apertura[2]),
      parole,
    });
  }

  return { pagine, metadati: testaMetadati(xml) };
}

/**
 * Quante parole ha il documento in tutto. È la misura con cui si decide se un
 * PDF è scansionato: un'immagine di una pagina di listino produce zero parole,
 * non poche.
 */
export function contaParole(documento: DocumentoParole): number {
  return documento.pagine.reduce((somma, pagina) => somma + pagina.parole.length, 0);
}
