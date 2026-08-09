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
}

export const SETTINGS_DEFAULTS: SettingsValues = {
  defaultVat: 22,
  alertPercentage: 3,
  alertEuro: 0.3,
  staleMonths: 6,
  priceChangePercentage: 40,
};

export const SETTINGS_KEYS: Record<keyof SettingsValues, string> = {
  defaultVat: 'ordini.ivaPredefinita',
  alertPercentage: 'avviso.sogliaPercentuale',
  alertEuro: 'avviso.sogliaEuro',
  staleMonths: 'prezzi.mesiPrimaDiConsiderarloFermo',
  priceChangePercentage: 'import.variazioneDaConfermare',
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
 * Un'impostazione non numerica non è un errore da propagare: è un valore
 * scritto male in una tabella libera, e la risposta giusta è il predefinito.
 * Fermare una pagina intera per una soglia illeggibile sarebbe peggio.
 */
export function valoriDaRighe(
  righe: ReadonlyArray<{ key: string; value: unknown }>,
): SettingsValues {
  const valori = { ...SETTINGS_DEFAULTS };
  for (const riga of righe) {
    const campo = SETTINGS_BY_KEY.get(riga.key);
    if (!campo) continue;
    if (typeof riga.value === 'number' && Number.isFinite(riga.value)) {
      valori[campo] = riga.value;
    }
  }
  return valori;
}
