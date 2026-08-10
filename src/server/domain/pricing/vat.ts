import { Decimal } from 'decimal.js';
import { MODO_ARROTONDAMENTO } from './discounts';

/**
 * Normalizzazione IVA dei prezzi usati da confronto e ordine.
 *
 * I prezzi MANUAL e ORDER arrivano già come imponibili. L'input PRICE_LIST,
 * invece, porta l'importo post-sconti riportato dal documento; quando il
 * fornitore dichiara `pricesIncludeVat`, quell'importo include l'IVA e viene
 * scorporato qui prima di raggiungere la colonna `price_net`.
 * Questa normalizzazione avviene al confine di **scrittura** del prezzo. Da
 * quel momento `price_net` e `unit_price` sono sempre imponibili canonici, e
 * tutte le letture (storico, confronto, statistiche e ordine) condividono lo
 * stesso numero senza correzioni ad hoc.
 *
 * L'aliquota segue una sola catena, condivisa da tutte le operazioni:
 * prezzo -> offerta -> fornitore -> impostazione dell'organizzazione.
 */

export type FonteAliquotaIva = 'PREZZO' | 'OFFERTA' | 'FORNITORE' | 'ORGANIZZAZIONE';

export class PrezzoIvaError extends Error {
  override readonly name = 'PrezzoIvaError';
}

export interface CatenaAliquotaIva {
  aliquotaPrezzo?: Decimal.Value | null;
  aliquotaOfferta?: Decimal.Value | null;
  aliquotaFornitore?: Decimal.Value | null;
  aliquotaOrganizzazione?: Decimal.Value | null;
}

export interface PrezzoDaNormalizzare extends CatenaAliquotaIva {
  /** Importo post-sconti da trasformare nell'imponibile canonico. */
  prezzoQuotato: Decimal.Value;
  originePrezzo: 'PRICE_LIST' | 'MANUAL' | 'ORDER';
  pricesIncludeVat: boolean;
}

export interface PrezzoNormalizzatoIva {
  /** Imponibile unitario, a quattro decimali come la colonna DB. */
  prezzoNetto: Decimal;
  aliquotaIva: Decimal;
  fonteAliquota: FonteAliquotaIva;
  /** Lordo unitario ricavato senza applicare due volte l'IVA. */
  prezzoLordo: Decimal;
}

function decimale(valore: Decimal.Value, campo: string): Decimal {
  try {
    const numero = new Decimal(valore);
    if (!numero.isFinite()) throw new Error('non finito');
    return numero;
  } catch {
    throw new PrezzoIvaError(`${campo} non è un numero valido.`);
  }
}

export function risolviAliquotaIva(input: CatenaAliquotaIva): {
  valore: Decimal;
  fonte: FonteAliquotaIva;
} {
  const candidate: ReadonlyArray<readonly [Decimal.Value | null | undefined, FonteAliquotaIva]> = [
    [input.aliquotaPrezzo, 'PREZZO'],
    [input.aliquotaOfferta, 'OFFERTA'],
    [input.aliquotaFornitore, 'FORNITORE'],
    [input.aliquotaOrganizzazione, 'ORGANIZZAZIONE'],
  ];

  const scelta = candidate.find(([valore]) => valore !== null && valore !== undefined);
  if (!scelta) {
    throw new PrezzoIvaError(
      'Aliquota IVA assente: completa il prezzo, l’offerta, il fornitore o l’impostazione predefinita.',
    );
  }

  const valore = decimale(scelta[0]!, 'L’aliquota IVA');
  if (valore.lt(0) || valore.gt(100)) {
    throw new PrezzoIvaError('L’aliquota IVA deve essere compresa fra 0 e 100.');
  }
  return { valore, fonte: scelta[1] };
}

export function normalizzaPrezzoIva(input: PrezzoDaNormalizzare): PrezzoNormalizzatoIva {
  const quotato = decimale(input.prezzoQuotato, 'Il prezzo quotato');
  if (quotato.lt(0)) throw new PrezzoIvaError('Il prezzo quotato non può essere negativo.');

  const aliquota = risolviAliquotaIva(input);
  const divisore = new Decimal(1).plus(aliquota.valore.div(100));
  // Un prezzo manuale viene inserito esplicitamente come netto. Applicare il
  // flag del fornitore anche a quello lo scorporerebbe una seconda volta.
  const quotatoLordo = input.originePrezzo === 'PRICE_LIST' && input.pricesIncludeVat;
  const netto = (quotatoLordo ? quotato.div(divisore) : quotato).toDecimalPlaces(
    4,
    MODO_ARROTONDAMENTO,
  );
  const lordo = (quotatoLordo ? quotato : netto.mul(divisore)).toDecimalPlaces(
    4,
    MODO_ARROTONDAMENTO,
  );

  return {
    prezzoNetto: netto,
    aliquotaIva: aliquota.valore,
    fonteAliquota: aliquota.fonte,
    prezzoLordo: lordo,
  };
}
