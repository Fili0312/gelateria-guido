/**
 * Quello che l'interfaccia riceve quando chiede la tassonomia.
 *
 * `productsCount` viaggia insieme al nome perché la domanda che segue sempre
 * «posso cancellare questa categoria?» è «quanti prodotti ci stanno dentro?»,
 * e farla in una seconda richiesta significherebbe mostrare un pulsante di
 * cancellazione prima di sapere cosa cancella.
 */

export interface CategoryItem {
  id: string;
  departmentId: string;
  name: string;
  sortOrder: number;
  active: boolean;
  productsCount: number;
}

export interface DepartmentItem {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  active: boolean;
  categories: CategoryItem[];
  /** Prodotti in tutte le categorie del reparto. */
  productsCount: number;
}

export interface TaxonomyResult {
  departments: DepartmentItem[];
  /** Prodotti senza categoria: la coda «da classificare». */
  unclassified: number;
}

/**
 * Il riferimento minimo che accompagna un prodotto: nome della categoria e
 * del reparto, più il colore per la pastiglia. Sono tre stringhe copiate
 * accanto al prodotto invece di un identificativo da risolvere in seguito,
 * perché ogni schermata che elenca prodotti li mostra, e farne una query a
 * parte sarebbe una richiesta in più per ogni riga.
 */
export interface ProductCategoryRef {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  departmentColor: string | null;
}

/** L'etichetta compatta: «Bar · Amari e liquori». */
export function etichettaCategoria(ref: ProductCategoryRef | null): string {
  return ref ? `${ref.departmentName} · ${ref.name}` : 'Da classificare';
}
