import { z } from 'zod';

/**
 * Le impostazioni dell'organizzazione: chiavi, valori predefiniti, tipi.
 *
 * Stavano in tre posti — la pagina che le legge, l'azione che le salva, e ora
 * il confronto prezzi che le usa. Tre copie di una mappa di chiavi divergono,
 * e divergerebbero **in silenzio**: una chiave scritta diversamente non dà
 * errore, restituisce semplicemente il valore predefinito per sempre, e
 * l'impostazione salvata dall'utente non fa niente senza che nulla lo segnali.
 */

export interface SettingsValues {
  /** IVA applicata quando il listino non la dichiara. */
  defaultVat: number;
  /** Sotto questa differenza percentuale non vale la pena cambiare fornitore. */
  alertPercentage: number;
  /** …e nemmeno sotto questi euro: le due soglie valgono **insieme**. */
  alertEuro: number;
  /** Dopo quanti mesi un prezzo si considera fermo. */
  staleMonths: number;
  /** Variazione oltre la quale un prezzo importato va confermato a mano. */
  priceChangePercentage: number;

  // ── L'intestazione dei documenti d'ordine ───────────────────────────────
  // Chi riceve il PDF deve capire dalla prima riga chi sta ordinando e dove
  // consegnare. Vuoti valgono come «non dichiarato»: il documento si genera
  // lo stesso, ripiegando sul nome dell'organizzazione, perché un ordine che
  // non parte per una partita IVA mancante è peggio di un ordine incompleto.
  /** Ragione sociale. Se vuota si usa il nome dell'organizzazione. */
  intestazioneNome: string;
  intestazioneIndirizzo: string;
  intestazionePiva: string;
  intestazioneTelefono: string;
  intestazioneEmail: string;

  // ── Il resto dell'ordine di acquisto ────────────────────────────────────
  /** Dove va consegnata la merce, se non è la sede scritta sopra. */
  consegnaIndirizzo: string;
  /**
   * Fra quanti giorni si chiede la consegna, contati dalla data dell'ordine.
   * `1` vuol dire «il giorno dopo».
   */
  consegnaGiorni: number;
  /** «Bonifico bancario 30 gg data fattura», o com'è l'accordo. */
  condizioniPagamento: string;
  /** Banca d'appoggio e IBAN: è dove il fornitore si aspetta il bonifico. */
  bancaAppoggio: string;
  /** La clausola di accettazione in fondo. Modificabile: è testo legale. */
  clausolaAccettazione: string;
}

export const SETTINGS_DEFAULTS: SettingsValues = {
  defaultVat: 22,
  alertPercentage: 3,
  alertEuro: 0.3,
  staleMonths: 6,
  priceChangePercentage: 40,
  intestazioneNome: '',
  intestazioneIndirizzo: '',
  intestazionePiva: '',
  intestazioneTelefono: '',
  intestazioneEmail: '',
  consegnaIndirizzo: '',
  consegnaGiorni: 1,
  condizioniPagamento: '',
  bancaAppoggio: '',
  clausolaAccettazione:
    'Vogliate restituirci copia della presente debitamente sottoscritta per accettazione. ' +
    'Non ricevendo comunicazione contraria, il suddetto ordine si intende accettato.',
};

export const SETTINGS_KEYS: Record<keyof SettingsValues, string> = {
  defaultVat: 'ordini.ivaPredefinita',
  alertPercentage: 'avviso.sogliaPercentuale',
  alertEuro: 'avviso.sogliaEuro',
  staleMonths: 'prezzi.mesiPrimaDiConsiderarloFermo',
  priceChangePercentage: 'import.variazioneDaConfermare',
  intestazioneNome: 'documenti.intestazione.nome',
  intestazioneIndirizzo: 'documenti.intestazione.indirizzo',
  intestazionePiva: 'documenti.intestazione.partitaIva',
  intestazioneTelefono: 'documenti.intestazione.telefono',
  intestazioneEmail: 'documenti.intestazione.email',
  consegnaIndirizzo: 'documenti.consegna.indirizzo',
  consegnaGiorni: 'documenti.consegna.giorni',
  condizioniPagamento: 'documenti.condizioniPagamento',
  bancaAppoggio: 'documenti.bancaAppoggio',
  clausolaAccettazione: 'documenti.clausolaAccettazione',
};

/** Dalla chiave salvata al campo: l'inverso di `SETTINGS_KEYS`. */
export const SETTINGS_BY_KEY = new Map<string, keyof SettingsValues>(
  (Object.entries(SETTINGS_KEYS) as [keyof SettingsValues, string][]).map(([campo, chiave]) => [
    chiave,
    campo,
  ]),
);

export const SETTINGS_ALL_KEYS: string[] = Object.values(SETTINGS_KEYS);

/**
 * Un'impostazione del tipo sbagliato non è un errore da propagare: è un valore
 * scritto male in una tabella libera, e la risposta giusta è il predefinito.
 * Fermare una pagina intera per una soglia illeggibile sarebbe peggio.
 *
 * Il tipo atteso lo detta il **predefinito**: dove il predefinito è un numero
 * si accettano solo numeri, dove è una stringa solo stringhe. Così non c'è un
 * secondo elenco di tipi da tenere allineato a `SettingsValues` — e un elenco
 * parallelo che diverge è esattamente il difetto che questo file esiste per
 * evitare.
 */
export function valoriDaRighe(
  righe: ReadonlyArray<{ key: string; value: unknown }>,
): SettingsValues {
  const valori = { ...SETTINGS_DEFAULTS };
  for (const riga of righe) {
    const campo = SETTINGS_BY_KEY.get(riga.key);
    if (!campo) continue;
    const atteso = typeof SETTINGS_DEFAULTS[campo];
    if (atteso === 'number' && typeof riga.value === 'number' && Number.isFinite(riga.value)) {
      (valori[campo] as number) = riga.value;
    } else if (atteso === 'string' && typeof riga.value === 'string') {
      (valori[campo] as string) = riga.value;
    }
  }
  return valori;
}

/**
 * La validazione di ciò che arriva dal form.
 *
 * Sta **qui** e non nel file `'use server'` dell'azione per una ragione che è
 * costata un guasto: un modulo `'use server'` può esportare soltanto funzioni
 * asincrone, e l'elenco dei campi esportato da lì faceva fallire l'intero
 * modulo a runtime — con un 500 al salvataggio e nessun errore in
 * compilazione. Non si salvava più **nessuna** impostazione, nemmeno quelle
 * che c'erano da mesi.
 */
const testoIntestazione = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // Gli a capo in un indirizzo li scriverebbe chiunque, ma in
    // `Content-Disposition` e nell'oggetto di un'email rompono l'header.
    .transform((t) => t.replace(/\s+/g, ' '));

export const settingsFormSchema = z.object({
  defaultVat: z.coerce.number().min(0).max(100),
  alertPercentage: z.coerce.number().min(0).max(100),
  alertEuro: z.coerce.number().min(0).max(10_000),
  staleMonths: z.coerce.number().int().min(1).max(60),
  priceChangePercentage: z.coerce.number().min(0).max(1_000),
  intestazioneNome: testoIntestazione(120),
  intestazioneIndirizzo: testoIntestazione(200),
  intestazionePiva: testoIntestazione(40),
  intestazioneTelefono: testoIntestazione(40),
  intestazioneEmail: testoIntestazione(120),
  consegnaIndirizzo: testoIntestazione(200),
  consegnaGiorni: z.coerce.number().int().min(0).max(60),
  condizioniPagamento: testoIntestazione(200),
  bancaAppoggio: testoIntestazione(200),
  clausolaAccettazione: testoIntestazione(500),
});

/**
 * Il compilatore verifica che lo schema copra **ogni** impostazione: un campo
 * aggiunto a `SettingsValues` e dimenticato qui non compila, invece di
 * salvarsi come predefinito in silenzio.
 */
const _copertura: Record<keyof SettingsValues, unknown> = settingsFormSchema.shape;
void _copertura;

/** I nomi dei campi da leggere dal form: si ricavano dallo schema, non a mano. */
export const CAMPI_IMPOSTAZIONI = Object.keys(settingsFormSchema.shape) as (keyof SettingsValues)[];
