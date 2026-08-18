import type { RisultatoOrdinabile } from '@/features/orders/dto';

/**
 * Reparti e categorie, contati.
 *
 * Trecentoventisei prodotti in un elenco unico si scorrono una volta e poi
 * non più: la seconda volta si cerca a memoria. Reparto e categoria sono il
 * modo in cui la merce è già organizzata nella testa di chi ordina — «mi
 * servono le birre», non «mi serve qualcosa che contiene la lettera b».
 *
 * Qui si contano soltanto: a disegnarli ci pensano `category-rail.tsx`, che
 * fa le card delle categorie, e `catalog-toolbar.tsx`, che tiene i reparti
 * dentro il pannello dei filtri. Il conteggio dice quanto c'è **prima** di
 * premere, e una voce vuota non compare affatto — un filtro che porta a zero
 * risultati è un filtro che non doveva esserci.
 *
 * Il filtro è **nel browser**, sull'elenco già caricato: la categoria cambia
 * senza aspettare niente. La ricerca invece va al server, perché trova anche
 * sinonimi e codici fornitore che qui non ci sono.
 */

export interface Gruppo {
  id: string;
  nome: string;
  colore: string | null;
  quanti: number;
}

/** Reparti e categorie presenti **fra i risultati mostrati**, con quanti. */
export function raggruppa(risultati: readonly RisultatoOrdinabile[]): {
  reparti: Gruppo[];
  categoriePerReparto: Map<string, Gruppo[]>;
} {
  const reparti = new Map<string, Gruppo>();
  const categorie = new Map<string, Map<string, Gruppo>>();

  for (const r of risultati) {
    const idReparto = r.category?.departmentId ?? 'senza';
    const nomeReparto = r.category?.departmentName ?? 'Senza reparto';
    const reparto = reparti.get(idReparto) ?? {
      id: idReparto,
      nome: nomeReparto,
      colore: r.category?.departmentColor ?? null,
      quanti: 0,
    };
    reparto.quanti += 1;
    reparti.set(idReparto, reparto);

    const dentro = categorie.get(idReparto) ?? new Map<string, Gruppo>();
    const idCat = r.category?.id ?? 'senza';
    const cat = dentro.get(idCat) ?? {
      id: idCat,
      nome: r.category?.name ?? 'Senza categoria',
      colore: null,
      quanti: 0,
    };
    cat.quanti += 1;
    dentro.set(idCat, cat);
    categorie.set(idReparto, dentro);
  }

  // Alfabetico, non per numerosità.
  //
  // Ordinare per quanti prodotti contiene metteva davanti il filtro più
  // grosso, che è utile con quattro voci e inutile con ventotto: in una
  // barra che scorre di lato, «Grappa» va cercata, e si cerca dove si sa che
  // sta. L'ordine per numerosità cambia anche da solo a ogni import — la
  // categoria che ieri era terza oggi è quinta — e un elenco che si sposta
  // sotto le dita non si impara mai.
  const ordina = (g: Gruppo[]) => g.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  return {
    reparti: ordina([...reparti.values()]),
    categoriePerReparto: new Map(
      [...categorie.entries()].map(([id, m]) => [id, ordina([...m.values()])] as const),
    ),
  };
}
