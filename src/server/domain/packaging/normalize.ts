/**
 * Normalizzazione del testo.
 *
 * Prima di qualunque confronto, ogni descrizione passa di qui: minuscolo,
 * senza accenti, abbreviazioni espanse, punteggiatura ridotta a spazi.
 * E' la base su cui poggiano la ricerca (indice trigram) e la generazione
 * dei candidati di abbinamento.
 */

/**
 * Abbreviazioni viste nei listini veri, espanse alla forma lunga.
 *
 * Non si espandono le unita' di misura: quelle le estrae il parser dei
 * formati, che gira prima. Qui stanno solo le parole che descrivono il
 * *contenitore* e le sigle commerciali.
 */
const ABBREVIAZIONI: Record<string, string> = {
  conf: 'confezione',
  cf: 'confezione',
  cart: 'cartone',
  ct: 'cartone',
  ctx: 'cartone',
  co: 'collo',
  bt: 'bottiglia',
  btg: 'bottiglia',
  bott: 'bottiglia',
  sc: 'scatola',
  scat: 'scatola',
  sacch: 'sacchetto',
  vasch: 'vaschetta',
  latt: 'lattina',
  // Sigle commerciali: compaiono nelle descrizioni e non sono nomi.
  vp: 'vuoto a perdere',
  vap: 'vuoto a perdere',
};

/** Intervallo Unicode dei segni diacritici combinanti. */
const SEGNI_COMBINANTI = /[̀-ͯ]/g;

/** Toglie gli accenti senza toccare il resto (pero' resta pero). */
export function senzaAccenti(testo: string): string {
  return testo.normalize('NFD').replace(SEGNI_COMBINANTI, '');
}

/**
 * Normalizzazione di base: quello che serve per cercare e confrontare.
 *
 * Non rimuove i token di formato — per quello c'e' `nucleoDescrizione()`
 * in `parse.ts`, che li estrae e li toglie in un colpo solo.
 */
export function normalizzaTesto(testo: string): string {
  // Minuscolo e senza accenti.
  let risultato = senzaAccenti(testo.toLowerCase());

  // Ogni carattere che non sia lettera o cifra diventa spazio. I numeri
  // sopravvivono come token separati ("cl.70" diventa "cl 70"), il che va
  // benissimo: quando questa funzione serve al confronto, i token di
  // formato sono gia' stati estratti e rimossi da `nucleoDescrizione()`.
  risultato = risultato.replace(/[^\p{L}\p{N}]+/gu, ' ');

  // Espansione delle abbreviazioni, parola per parola.
  risultato = risultato
    .split(' ')
    .map((parola) => ABBREVIAZIONI[parola] ?? parola)
    .join(' ');

  return risultato.replace(/\s+/g, ' ').trim();
}

/**
 * Forma canonica per il confronto: parole ordinate alfabeticamente e
 * deduplicate.
 *
 * E' cio' che rende "Birra XYZ" e "XYZ Birra" la stessa cosa. L'ordine
 * delle parole cambia da fornitore a fornitore e non porta informazione.
 */
export function ordinaParole(testo: string): string {
  const parole = testo.split(' ').filter(Boolean);
  return [...new Set(parole)].sort().join(' ');
}

/**
 * Parole troppo generiche per distinguere un prodotto da un altro.
 * Restano nel testo di ricerca ma non pesano nel punteggio di somiglianza.
 */
const PAROLE_DEBOLI = new Set([
  'confezione',
  'cartone',
  'collo',
  'bottiglia',
  'scatola',
  'lattina',
  'sacchetto',
  'vaschetta',
  'barattolo',
  'vuoto',
  'perdere',
  'pet',
  'da',
  'di',
  'del',
  'della',
  'con',
  'il',
  'la',
  'lo',
]);

export function paroleSignificative(testo: string): string[] {
  return testo.split(' ').filter((p) => p.length > 1 && !PAROLE_DEBOLI.has(p));
}
