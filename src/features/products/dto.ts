import type { ProductCategoryRef } from '@/features/taxonomy/dto';
import type { UnitOfMeasureValue } from './schema';

export type BaseUnitValue = 'PIECE' | 'KG' | 'L';
export type PriceBasisValue = 'PER_PIECE' | 'PER_KG' | 'PER_L';
export type MatchStatusValue = 'AUTO' | 'PENDING' | 'NEW' | 'CONFIRMED' | 'REJECTED' | 'IGNORED';

/** Un'offerta: il prodotto così come lo vende un fornitore, col suo prezzo. */
export interface SupplierOffer {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierActive: boolean;
  supplierCode: string | null;
  rawName: string;
  description: string | null;
  brand: string | null;
  /** La categoria **come la scrive il fornitore**: testo grezzo del listino,
   *  non la nostra tassonomia. Serve da indizio, non da classificazione. */
  category: string | null;
  packagingType: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  /** «Tutti tranne alcuni»: questa offerta è fra gli alcuni. */
  extraDiscountExcluded: boolean;
  /** Sconto extra solo per questa offerta, diverso da quello del fornitore. */
  extraDiscountPct: string | null;
  /** Lo sconto che si applica davvero, fornitore ed eccezioni comprese. */
  scontoExtraApplicato: string;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  contentPerPack: string;
  baseUnit: BaseUnitValue;
  vatRate: string | null;
  gtin: string | null;
  active: boolean;
  matchStatus: MatchStatusValue;
  productId: string | null;
  /** Il prezzo corrente, quando c'è. Le offerte senza prezzo non si ordinano. */
  price: {
    priceList: string;
    discounts: number[];
    priceNet: string;
    unitPrice: string;
    unitPriceBasis: PriceBasisValue;
    validFrom: string;
  } | null;
}

export interface ProductAliasItem {
  id: string;
  text: string;
  normalizedText: string;
  source: 'SUPPLIER' | 'USER' | 'AI';
  negative: boolean;
  supplierId: string | null;
  createdAt: string;
}

/**
 * Il prezzo mostrato in catalogo, con accanto **a cosa si riferisce**.
 *
 * Le due cose viaggiano insieme di proposito: «4,72 €» da solo non è
 * un'informazione, perché non si sa se è la bottiglia o il cartone da 24. Chi
 * legge il catalogo deve poter capire cosa sta guardando senza aprire la
 * scheda.
 */
export interface CatalogPrice {
  supplierProductId: string;
  supplierName: string;
  /** Il netto della confezione, come lo fa il fornitore. */
  priceNet: string;
  /** €/L o €/kg: `null` quando la confezione non è dichiarata. */
  unitPrice: string | null;
  unitPriceBasis: PriceBasisValue | null;
  /** La confezione a cui il netto si riferisce. */
  packQuantity: number;
  packagingType: string | null;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  packQuantityConfirmed: boolean;
  /** Quante offerte attive hanno un prezzo. */
  offersWithPrice: number;
  /** `true` solo se la scelta viene da un confronto di prezzi unitari. */
  compared: boolean;
  /** Risparmio rispetto alla più cara, quando il confronto è vero. */
  savingPct: string | null;
}

export interface ProductListItem {
  id: string;
  name: string;
  brand: string | null;
  /** `null` significa «da classificare», che è una coda di lavoro visibile. */
  category: ProductCategoryRef | null;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  baseUnit: BaseUnitValue;
  normalizedName: string;
  gtin: string | null;
  createdBy: 'USER' | 'AI' | 'IMPORT';
  updatedAt: string;
  offersCount: number;
  /** Offerte con la confezione dichiarata: le altre non sono confrontabili. */
  comparableOffersCount: number;
  /** `null` quando nessuna offerta attiva ha un prezzo corrente. */
  price: CatalogPrice | null;
}

export interface ProductDetail extends ProductListItem {
  createdAt: string;
  offers: SupplierOffer[];
  aliases: ProductAliasItem[];
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  linked: number;
  orphan: number;
  /** Prodotti senza categoria nell'intero catalogo: la coda «da classificare». */
  unclassified: number;
}

export interface ProductSearchHit {
  id: string;
  name: string;
  brand: string | null;
  category: ProductCategoryRef | null;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  offersCount: number;
  /** 0..1. Serve a spiegare l'ordine, non a filtrare due volte. */
  score: number;
  /** Da dove è arrivato il riscontro: aiuta a capire perché è in elenco. */
  via: 'nome' | 'alias' | 'fornitore' | 'codice';
}

export interface ProductSearchResult {
  items: ProductSearchHit[];
  /** Il termine dopo la normalizzazione: utile per capire cosa è stato cercato. */
  normalized: string;
  strategy: 'prefisso' | 'somiglianza';
  elapsedMs: number;
}

export interface SupplierProductListItem extends SupplierOffer {
  productName: string | null;
}

export interface SupplierProductListResult {
  items: SupplierProductListItem[];
  total: number;
  linked: number;
  orphan: number;
}

export interface ProductApiErrorBody {
  ok: false;
  error: string;
  fields?: Record<string, string[]>;
}

export interface ProductApiSuccessBody<T> {
  ok: true;
  data: T;
}

export type ProductApiBody<T> = ProductApiSuccessBody<T> | ProductApiErrorBody;

/**
 * Un'offerta è confrontabile solo se sappiamo quanti pezzi contiene la
 * confezione. Senza, il prezzo per litro sarebbe calcolato su un numero
 * inventato — e sembrerebbe un dato come tutti gli altri.
 */
export function offerIsComparable(offer: Pick<SupplierOffer, 'packQuantityConfirmed'>): boolean {
  return offer.packQuantityConfirmed;
}

export function countComparableOffers(offers: readonly SupplierOffer[]): number {
  return offers.filter(offerIsComparable).length;
}
