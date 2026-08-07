import { normalizzaTesto } from '../packaging/normalize';

/**
 * Punto di partenza della tassonomia per una nuova organizzazione.
 *
 * La migrazione SQL copia gli stessi dati nelle organizzazioni già presenti
 * al momento del deploy; il seed usa questa struttura per l'organizzazione
 * che crea su un database completamente vuoto. Dopo il bootstrap la fonte è
 * l'interfaccia: il seed non sovrascrive mai una tassonomia già esistente.
 */
export const TASSONOMIA_INIZIALE = [
  {
    name: 'Bar',
    color: '#b45309',
    sortOrder: 10,
    categories: [
      'Acqua',
      'Bibite',
      'Birre',
      'Aperitivi',
      'Amari e liquori',
      'Distillati',
      'Vini e spumanti',
      'Sciroppi',
      'Caffè e infusi',
      'Snack e salatini',
    ],
  },
  {
    name: 'Gelateria',
    color: '#be185d',
    sortOrder: 20,
    categories: [
      'Basi e semilavorati',
      'Latte, panna e uova',
      'Zucchero e neutri',
      'Paste e aromi',
      'Frutta e polpe',
      'Cioccolato e coperture',
      'Variegati e topping',
      'Frutta secca e granelle',
      'Coni, cialde e biscotti',
      'Vaschette e coppette',
    ],
  },
  {
    name: 'Cucina',
    color: '#15803d',
    sortOrder: 30,
    categories: [
      'Farine e sfarinati',
      'Conserve e sughi',
      'Salumi e formaggi',
      'Surgelati',
      'Olio, aceto e spezie',
    ],
  },
  {
    name: 'Pulizia e consumo',
    color: '#475569',
    sortOrder: 40,
    categories: [
      'Detergenti e sanificanti',
      'Carta e tovaglioli',
      'Palette e cucchiaini',
      'Sacchetti e imballaggi',
    ],
  },
] as const;

/**
 * Da come il fornitore chiama una categoria, a come la chiamiamo noi.
 *
 * Serve in tre punti diversi — il seed, l'import dei listini (Fase 7) e la
 * riclassificazione di un catalogo già esistente — e in tutti e tre la
 * domanda è la stessa: «AMARO» del listino Barzelli e «Amari» di Cecconi
 * sono la stessa cosa, e stanno in "Amari e liquori".
 *
 * Due proprietà volute:
 *
 *  - **suggerisce, non decide.** Il risultato è una proposta che l'operatore
 *    vede e può cambiare in revisione. Un prodotto proposto nella categoria
 *    sbagliata si sposta in un clic; un prodotto classificato in silenzio
 *    sulla base di un'euristica resta sbagliato per sempre.
 *  - **null è una risposta.** Quando nessuna regola scatta la funzione non
 *    ripiega su una categoria generica: il prodotto resta «da classificare»,
 *    che è una coda visibile, mentre una casa sbagliata non lo è.
 */

/**
 * Le parole che, trovate nel testo della categoria del fornitore, indicano la
 * nostra. **L'ordine conta**: si scorre dall'alto e vince la prima che
 * corrisponde, quindi le parole distintive stanno prima di quelle generiche.
 *
 * Il caso che detta l'ordine è «GRAPPE E LIQUORI», che nei listini esiste:
 * «grappa» dice qualcosa di preciso, «liquori» quasi niente. Se il generico
 * venisse prima, quella voce finirebbe in "Amari e liquori" — plausibile, e
 * sbagliata. Per questo «liquore» sta in fondo all'elenco, da solo, come
 * ripiego dichiarato.
 */
const REGOLE: readonly { categoria: string; parole: readonly string[] }[] = [
  { categoria: 'Acqua', parole: ['acqua', 'acque', 'minerale'] },
  { categoria: 'Birre', parole: ['birra', 'birre'] },
  { categoria: 'Aperitivi', parole: ['aperitivo', 'aperitivi', 'vermouth', 'vermut', 'bitter'] },
  { categoria: 'Amari e liquori', parole: ['amaro', 'amari'] },
  {
    categoria: 'Distillati',
    parole: [
      'distillato',
      'distillati',
      'grappa',
      'grappe',
      'rum',
      'ron',
      'gin',
      'vodka',
      'whisky',
      'whiskey',
      'brandy',
      'cognac',
      'tequila',
    ],
  },
  {
    categoria: 'Vini e spumanti',
    parole: ['vino', 'vini', 'spumante', 'spumanti', 'prosecco', 'champagne'],
  },
  { categoria: 'Sciroppi', parole: ['sciroppo', 'sciroppi'] },
  {
    categoria: 'Caffè e infusi',
    parole: ['caffe', 'cafe', 'the', 'tisana', 'tisane', 'infuso', 'infusi'],
  },
  { categoria: 'Snack e salatini', parole: ['snack', 'salatini', 'patatine', 'aperitivo salato'] },
  {
    categoria: 'Bibite',
    parole: ['bibita', 'bibite', 'analcolico', 'analcolici', 'soft drink', 'succo', 'succhi'],
  },

  {
    categoria: 'Basi e semilavorati',
    parole: ['base', 'basi', 'semilavorato', 'semilavorati', 'neutro gelato'],
  },
  { categoria: 'Latte, panna e uova', parole: ['latte', 'panna', 'uova', 'uovo', 'tuorlo'] },
  {
    categoria: 'Zucchero e neutri',
    parole: ['zucchero', 'zuccheri', 'destrosio', 'neutro', 'neutri', 'addensante'],
  },
  {
    categoria: 'Paste e aromi',
    parole: ['pasta aroma', 'paste', 'aroma', 'aromi', 'essenza', 'essenze'],
  },
  {
    categoria: 'Frutta e polpe',
    parole: ['polpa', 'polpe', 'purea', 'puree', 'frutta fresca', 'succo frutta'],
  },
  {
    categoria: 'Cioccolato e coperture',
    parole: ['cioccolato', 'cacao', 'copertura', 'coperture', 'gianduia'],
  },
  {
    categoria: 'Variegati e topping',
    parole: ['variegato', 'variegati', 'topping', 'salsa', 'salse'],
  },
  {
    categoria: 'Frutta secca e granelle',
    parole: [
      'granella',
      'granelle',
      'nocciola',
      'nocciole',
      'mandorla',
      'mandorle',
      'pistacchio',
      'frutta secca',
    ],
  },
  {
    categoria: 'Coni, cialde e biscotti',
    parole: ['cono', 'coni', 'cialda', 'cialde', 'biscotto', 'biscotti', 'wafer'],
  },
  {
    categoria: 'Vaschette e coppette',
    parole: ['vaschetta', 'vaschette', 'coppetta', 'coppette', 'carapina'],
  },

  { categoria: 'Farine e sfarinati', parole: ['farina', 'farine', 'semola', 'lievito'] },
  {
    categoria: 'Conserve e sughi',
    parole: ['conserva', 'conserve', 'sugo', 'sughi', 'pomodoro', 'passata'],
  },
  {
    categoria: 'Salumi e formaggi',
    parole: ['salume', 'salumi', 'formaggio', 'formaggi', 'prosciutto', 'mozzarella'],
  },
  { categoria: 'Surgelati', parole: ['surgelato', 'surgelati', 'congelato'] },
  {
    categoria: 'Olio, aceto e spezie',
    parole: ['olio', 'oli', 'aceto', 'spezia', 'spezie', 'sale'],
  },

  {
    categoria: 'Detergenti e sanificanti',
    parole: ['detergente', 'detergenti', 'detersivo', 'sanificante', 'igienizzante', 'pulizia'],
  },
  { categoria: 'Carta e tovaglioli', parole: ['tovagliolo', 'tovaglioli', 'carta', 'asciugamano'] },
  {
    categoria: 'Palette e cucchiaini',
    parole: ['paletta', 'palettine', 'cucchiaino', 'cucchiaini', 'posate'],
  },
  {
    categoria: 'Sacchetti e imballaggi',
    parole: ['sacchetto', 'sacchetti', 'busta', 'buste', 'imballaggio', 'scatola'],
  },

  // In fondo, i generici: scattano solo se nessuna parola distintiva ha già
  // deciso. «LIQUORI» da solo è un'informazione; dentro «GRAPPE E LIQUORI»
  // non lo è.
  { categoria: 'Amari e liquori', parole: ['liquore', 'liquori'] },
];

/**
 * La categoria proposta per un testo di categoria del fornitore, o `null` se
 * nessuna regola scatta.
 *
 * Il confronto passa dalla stessa normalizzazione dei nomi prodotto, quindi
 * «CAFFE'», «Caffè» e «caffe» sono la stessa parola.
 */
export function categoriaSuggerita(testoFornitore: string | null | undefined): string | null {
  if (!testoFornitore) return null;
  const testo = normalizzaTesto(testoFornitore);
  if (!testo) return null;

  for (const regola of REGOLE) {
    for (const parola of regola.parole) {
      if (contieneParola(testo, normalizzaTesto(parola))) return regola.categoria;
    }
  }
  return null;
}

/**
 * Confronto per parole intere e non per sottostringa: `includes` farebbe
 * scattare «oli» dentro «cioccolato» e «the» dentro «sorbetto», e sarebbe un
 * errore silenzioso — la categoria proposta *sembrerebbe* solo un po' strana.
 */
function contieneParola(testo: string, parola: string): boolean {
  if (!parola) return false;
  const parole = testo.split(' ');
  const cercate = parola.split(' ');
  if (cercate.length === 1) return parole.includes(parola);

  for (let i = 0; i + cercate.length <= parole.length; i++) {
    if (cercate.every((p, j) => parole[i + j] === p)) return true;
  }
  return false;
}
