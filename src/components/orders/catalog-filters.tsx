'use client';

import { AppIcon } from '@/components/app-icon';
import type { RisultatoOrdinabile } from '@/features/orders/dto';

/**
 * Reparti e categorie, come navigazione.
 *
 * Trecentoventisei prodotti in un elenco unico si scorrono una volta e poi
 * non più: la seconda volta si cerca a memoria. Reparto e categoria sono il
 * modo in cui la merce è già organizzata nella testa di chi ordina — «mi
 * servono le birre», non «mi serve qualcosa che contiene la lettera b».
 *
 * I conteggi stanno **dentro** le voci e non a fianco: dicono quanto c'è
 * prima di premere, e una voce vuota non compare affatto. Un filtro che
 * porta a zero risultati è un filtro che non doveva esserci.
 *
 * Il filtro è **nel browser**, sull'elenco già caricato: il reparto cambia
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

function Voce({
  attiva,
  onClick,
  children,
  quanti,
  colore,
}: {
  attiva: boolean;
  onClick: () => void;
  children: React.ReactNode;
  quanti?: number;
  colore?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors ${
        attiva
          ? 'border-neutral-900 bg-neutral-900 font-semibold text-white'
          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
      }`}
    >
      {colore && !attiva && (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colore }} />
      )}
      {children}
      {quanti !== undefined && (
        <span className={`tabellare text-xs ${attiva ? 'text-white/70' : 'text-neutral-400'}`}>
          {quanti}
        </span>
      )}
    </button>
  );
}

export function CatalogFilters({
  reparti,
  categorie,
  repartoScelto,
  categoriaScelta,
  onReparto,
  onCategoria,
  totale,
}: {
  reparti: Gruppo[];
  categorie: Gruppo[];
  repartoScelto: string | null;
  categoriaScelta: string | null;
  onReparto: (id: string | null) => void;
  onCategoria: (id: string | null) => void;
  totale: number;
}) {
  return (
    <div className="space-y-2">
      {reparti.length > 1 && (
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-0.5">
          <Voce attiva={repartoScelto === null} onClick={() => onReparto(null)} quanti={totale}>
            Tutti
          </Voce>
          {reparti.map((r) => (
            <Voce
              key={r.id}
              attiva={repartoScelto === r.id}
              onClick={() => onReparto(r.id)}
              quanti={r.quanti}
              colore={r.colore}
            >
              {r.nome}
            </Voce>
          ))}
        </div>
      )}

      {categorie.length > 1 && (
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-0.5">
          <Voce attiva={categoriaScelta === null} onClick={() => onCategoria(null)}>
            <AppIcon name="chevron" className="h-3 w-3 rotate-90 text-neutral-400" />
            Tutte le categorie
          </Voce>
          {categorie.map((c) => (
            <Voce
              key={c.id}
              attiva={categoriaScelta === c.id}
              onClick={() => onCategoria(c.id)}
              quanti={c.quanti}
            >
              {c.nome}
            </Voce>
          ))}
        </div>
      )}
    </div>
  );
}
