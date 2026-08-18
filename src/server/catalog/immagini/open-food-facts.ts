import 'server-only';

import { type Candidato } from './punteggio';

/**
 * Open Food Facts, con le buone maniere.
 *
 * ── Perché questa fonte ─────────────────────────────────────────────────
 * È un archivio di prodotti **reali**, aperto, interrogabile per barcode:
 * quando il listino porta l'EAN si ottiene la foto di quella precisa
 * bottiglia, non di una che le somiglia. Non chiede chiavi, quindi non c'è
 * nessun segreto da tenere fuori dal frontend — il che, di riflesso, toglie
 * anche il modo di farlo trapelare.
 *
 * ── Perché una richiesta per volta ──────────────────────────────────────
 * È un servizio gratuito mantenuto da un'associazione. Cinquecento prodotti
 * lanciati in parallelo sono un piccolo attacco, e la risposta — l'ho vista
 * arrivare durante lo sviluppo — è una pagina HTML di cortesia al posto del
 * JSON. Qui le richieste sono in fila indiana con una pausa in mezzo: il
 * riempimento del catalogo è un lavoro di sottofondo, e non ha nessuna
 * fretta.
 */

const RADICE = 'https://world.openfoodfacts.org';

/**
 * La ricerca sta su un altro servizio, e non è un dettaglio.
 *
 * `/api/v2/search` accetta `search_terms` **e lo ignora**: risponde 200 con
 * l'intero archivio, quattro milioni e mezzo di schede, ordinate per conto
 * suo. Non è un errore che si veda — arriva del JSON valido, pieno di
 * prodotti veri — ed è così che una prima versione di questo codice ha
 * dato un punteggio a dei latticini marocchini credendo di valutare la
 * vodka. Il pescato giusto è `search.openfoodfacts.org`, che cerca sul
 * serio.
 */
const RADICE_RICERCA = 'https://search.openfoodfacts.org';

/**
 * Chi siamo. Open Food Facts chiede di identificarsi e blocca gli anonimi:
 * senza questa riga il riempimento sembra funzionare finché non si guarda
 * quante foto ha trovato.
 */
const IDENTITA = 'GelateriaGuido/1.0 (gestionale ordini; contatto via filippo.eventoyou.com)';

/** I campi che servono: chiederne meno è più veloce e più gentile. */
const CAMPI = 'code,product_name,brands,quantity,image_front_url,image_front_small_url';

export class FonteImmaginiError extends Error {
  override readonly name = 'FonteImmaginiError';
}

export interface SchedaTrovata extends Candidato {
  /** L'indirizzo della foto frontale, il più grande disponibile. */
  foto: string | null;
  /** La versione ridotta, quando c'è: pesa un decimo. */
  fotoPiccola: string | null;
}

/** Millisecondi fra una richiesta e la successiva. */
const PAUSA_MS = 700;
const TIMEOUT_MS = 12_000;

let ultima = 0;
/** La fila: ogni chiamata aspetta chi la precede, non solo l'orologio. */
let coda: Promise<unknown> = Promise.resolve();

function attendi(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Una richiesta, in coda, con un solo tentativo in più.
 *
 * Si ritenta **una** volta e solo su errore di rete o 5xx: un 404 è una
 * risposta («quel barcode non c'è»), e ripeterla è solo rumore. Un 429 è la
 * fonte che ci dice di rallentare, e la si ascolta aspettando di più.
 */
async function chiedi(url: string): Promise<unknown | null> {
  const eseguo = async (): Promise<unknown | null> => {
    for (let tentativo = 0; tentativo < 2; tentativo += 1) {
      const distanza = Date.now() - ultima;
      if (distanza < PAUSA_MS) await attendi(PAUSA_MS - distanza);
      ultima = Date.now();

      const stop = AbortSignal.timeout(TIMEOUT_MS);
      try {
        const risposta = await fetch(url, {
          signal: stop,
          headers: { 'User-Agent': IDENTITA, Accept: 'application/json' },
        });

        if (risposta.status === 404) return null;
        if (risposta.status === 429) {
          await attendi(5_000);
          continue;
        }
        if (risposta.status >= 500) continue;
        if (!risposta.ok) return null;

        // Quando il servizio è sotto sforzo risponde 200 con una pagina
        // HTML. `json()` esploderebbe con un errore che non dice niente:
        // meglio riconoscerlo e trattarlo come «non trovato».
        const tipo = risposta.headers.get('content-type') ?? '';
        if (!tipo.includes('json')) return null;
        return (await risposta.json()) as unknown;
      } catch {
        // Rete o timeout: il secondo giro ha senso.
      }
    }
    return null;
  };

  const mio = coda.then(eseguo, eseguo);
  coda = mio.catch(() => {});
  return mio;
}

interface ProdottoOff {
  code?: string;
  product_name?: string;
  /** Stringa dalle schede, array dalla ricerca: le due API differiscono. */
  brands?: string | string[];
  quantity?: string;
  image_front_url?: string;
  image_front_small_url?: string;
}

function aScheda(p: ProdottoOff): SchedaTrovata | null {
  const foto = p.image_front_url?.trim() || null;
  const piccola = p.image_front_small_url?.trim() || null;
  // Una scheda senza foto non serve a niente qui: esiste, ma non risponde
  // alla domanda che stiamo facendo.
  if (!foto && !piccola) return null;
  return {
    nome: p.product_name?.trim() ?? '',
    marche: (Array.isArray(p.brands) ? p.brands.join(', ') : p.brands)?.trim() || null,
    quantita: p.quantity?.trim() || null,
    codice: p.code?.trim() || null,
    foto,
    fotoPiccola: piccola,
  };
}

/** La scheda di un barcode preciso. */
export async function perEan(ean: string): Promise<SchedaTrovata | null> {
  const corpo = (await chiedi(
    `${RADICE}/api/v2/product/${encodeURIComponent(ean)}.json?fields=${CAMPI}`,
  )) as { status?: number; product?: ProdottoOff } | null;
  if (!corpo || corpo.status !== 1 || !corpo.product) return null;
  return aScheda(corpo.product);
}

/**
 * Le schede che somigliano a una descrizione.
 *
 * Ne torna poche: il punteggio le esamina tutte, e cinquanta candidati non
 * fanno trovare la foto giusta più spesso — fanno solo scaricare più roba.
 */
export async function perTesto(query: string, quante = 8): Promise<SchedaTrovata[]> {
  const testo = query.trim();
  if (testo.length < 3) return [];
  const url =
    `${RADICE_RICERCA}/search?q=${encodeURIComponent(testo)}` +
    `&page_size=${quante}&fields=${CAMPI}`;
  const corpo = (await chiedi(url)) as { hits?: ProdottoOff[] } | null;
  if (!corpo?.hits) return [];
  return corpo.hits.map(aScheda).filter((s): s is SchedaTrovata => s !== null);
}

/** Scarica i byte di una foto. `null` se non è un'immagine o è troppo grande. */
export async function scarica(
  url: string,
  massimoByte = 2_000_000,
): Promise<{ dati: Uint8Array; tipo: string } | null> {
  try {
    const risposta = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': IDENTITA },
    });
    if (!risposta.ok) return null;
    const tipo = risposta.headers.get('content-type') ?? '';
    if (!tipo.startsWith('image/')) return null;
    const dati = new Uint8Array(await risposta.arrayBuffer());
    if (dati.byteLength === 0 || dati.byteLength > massimoByte) return null;
    return { dati, tipo };
  } catch {
    return null;
  }
}
