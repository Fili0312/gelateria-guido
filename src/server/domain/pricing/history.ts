import { Decimal } from 'decimal.js';
import { MODO_ARROTONDAMENTO } from './discounts';

/**
 * Storico prezzi: variazioni e lettura alla data.
 *
 * Il modello e' append-only con validita' temporale: un prezzo nuovo chiude
 * il precedente e ne inserisce uno nuovo, e il prezzo corrente e' quello con
 * `validTo` nullo. Da qui derivano, senza altre tabelle, tutte le domande
 * che il punto 4 della specifica pone.
 */

export type Direzione = 'AUMENTO' | 'DIMINUZIONE' | 'INVARIATO';

export interface Variazione {
  assoluta: Decimal;
  percentuale: Decimal;
  direzione: Direzione;
}

/**
 * Variazione fra due prezzi. La percentuale e' sempre riferita al
 * precedente: da 9,80 a 10,20 sono +4,08%, non +3,92%.
 */
export function variazione(precedente: Decimal.Value, corrente: Decimal.Value): Variazione {
  const prima = new Decimal(precedente);
  const dopo = new Decimal(corrente);
  const assoluta = dopo.minus(prima);

  const percentuale = prima.isZero()
    ? new Decimal(0)
    : assoluta.div(prima).mul(100).toDecimalPlaces(2, MODO_ARROTONDAMENTO);

  const direzione: Direzione = assoluta.isZero()
    ? 'INVARIATO'
    : assoluta.isPositive()
      ? 'AUMENTO'
      : 'DIMINUZIONE';

  return { assoluta: assoluta.toDecimalPlaces(4, MODO_ARROTONDAMENTO), percentuale, direzione };
}

/**
 * Una riga di storico, ridotta ai campi che servono a questo modulo.
 * Le date sono stringhe `AAAA-MM-GG` o `Date`: si confrontano come giorni,
 * senza orari, perche' la validita' di un listino e' una data e non un
 * istante — e mescolare fusi orari qui creerebbe bug invisibili.
 */
export interface RigaPrezzo {
  priceNet: Decimal.Value;
  validFrom: Date | string;
  validTo?: Date | string | null;
}

function giorno(valore: Date | string): string {
  if (typeof valore === 'string') return valore.slice(0, 10);
  return valore.toISOString().slice(0, 10);
}

/**
 * Il prezzo in vigore a una certa data.
 *
 * Serve soprattutto a rileggere un ordine vecchio: senza, un ordine di sei
 * mesi fa mostrerebbe i prezzi di oggi.
 */
export function prezzoAllaData(
  storico: readonly RigaPrezzo[],
  data: Date | string,
): RigaPrezzo | null {
  const g = giorno(data);
  const candidate = storico.filter((r) => {
    const da = giorno(r.validFrom);
    const a = r.validTo ? giorno(r.validTo) : null;
    return da <= g && (a === null || a > g);
  });
  if (candidate.length === 0) return null;
  // Se per errore ci fossero sovrapposizioni, vince il piu' recente:
  // meglio un prezzo che nessun prezzo, e l'anomalia si vede nello storico.
  return candidate.sort((a, b) => giorno(b.validFrom).localeCompare(giorno(a.validFrom)))[0]!;
}

/** Il prezzo corrente: quello con `validTo` nullo. */
export function prezzoCorrente(storico: readonly RigaPrezzo[]): RigaPrezzo | null {
  return storico.find((r) => r.validTo === null || r.validTo === undefined) ?? null;
}

export interface PassoStorico {
  da: string;
  prezzo: Decimal;
  variazione: Variazione | null;
}

/**
 * Lo storico in forma di serie, con la variazione a ogni passo.
 *
 * E' esattamente la tabella chiesta dal punto 4 della specifica:
 * 01/05 -> 9,50 · 01/06 -> 9,80 (+3,16%) · 01/07 -> 10,20 (+4,08%)
 */
export function serieStorica(storico: readonly RigaPrezzo[]): PassoStorico[] {
  const ordinato = [...storico].sort((a, b) =>
    giorno(a.validFrom).localeCompare(giorno(b.validFrom)),
  );
  return ordinato.map((riga, i) => {
    const precedente = i > 0 ? ordinato[i - 1]! : null;
    return {
      da: giorno(riga.validFrom),
      prezzo: new Decimal(riga.priceNet),
      variazione: precedente ? variazione(precedente.priceNet, riga.priceNet) : null,
    };
  });
}

/**
 * Un prezzo e' "non aggiornato" quando il listino da cui viene e' piu'
 * vecchio della soglia. Non lo si butta: lo si dichiara, e chi guarda il
 * confronto sa che sta guardando un dato fermo.
 */
export function prezzoStantio(
  validFrom: Date | string,
  oggi: Date | string,
  mesiSoglia: number,
): boolean {
  const da = new Date(giorno(validFrom));
  const ora = new Date(giorno(oggi));
  const limite = new Date(da);
  limite.setMonth(limite.getMonth() + mesiSoglia);
  return ora > limite;
}
