import type { BaseUnitValue, PriceBasisValue, SupplierOffer } from './dto';
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
 * Il prezzo per unità, oppure il motivo per cui non c'è.
 *
 * Restituire la stringa «—» quando la confezione è ignota è deliberato: un
 * numero calcolato su pezzi inventati sarebbe indistinguibile da uno vero.
 */
export function prezzoUnitario(offer: SupplierOffer): string {
  if (!offer.price) return '—';
  if (!offer.packQuantityConfirmed) return 'confezione da definire';
  return `${euro(offer.price.unitPrice, 4)} ${etichettaBasis(offer.price.unitPriceBasis).slice(1)}`;
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
