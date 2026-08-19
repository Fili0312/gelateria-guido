'use client';

import type { RisultatoOrdinabile } from '@/features/orders/dto';
import { ProductCard } from './product-card';

/**
 * L'elenco dei prodotti, a card.
 *
 * ── Perché resta il raggruppamento per categoria ────────────────────────
 * Cinquecento card di fila non hanno appigli: si scorre e si perde il segno.
 * L'intestazione di categoria dice sempre in che parte del catalogo si è.
 *
 * Quando una categoria è già stata scelta non si raggruppa: sarebbe un
 * gruppo solo, con l'intestazione a ripetere il filtro appena premuto.
 */
export function ProductRail({
  risultati,
  raggruppa = true,
  selezione,
  perOfferta,
  onSeleziona,
  onAggiungi,
  onCambiaQuantita,
  onRimuovi,
}: {
  risultati: RisultatoOrdinabile[];
  raggruppa?: boolean;
  selezione: number;
  perOfferta: Map<string, { rigaId: string; quantita: number }>;
  onSeleziona: (indice: number) => void;
  onAggiungi: (supplierProductId: string) => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
}) {
  if (risultati.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center text-sm leading-6 text-neutral-500">
        Nessun risultato. Provare con il codice articolo del fornitore, con un termine più breve o
        rimuovendo un filtro.
      </p>
    );
  }

  const card = (risultato: RisultatoOrdinabile, indice: number) => (
    <ProductCard
      key={risultato.productId}
      risultato={risultato}
      attiva={indice === selezione}
      perOfferta={perOfferta}
      onSeleziona={() => onSeleziona(indice)}
      onAggiungi={onAggiungi}
      onCambiaQuantita={onCambiaQuantita}
      onRimuovi={onRimuovi}
    />
  );

  if (!raggruppa) {
    return (
      <ul className="space-y-2" aria-label="Prodotti da ordinare">
        {risultati.map(card)}
      </ul>
    );
  }

  // I gruppi conservano l'ordine in cui i prodotti sono arrivati: la ricerca
  // li dà per pertinenza, e riordinarli per categoria butterebbe via proprio
  // l'informazione per cui si è cercato.
  const gruppi: { chiave: string; nome: string; indici: number[] }[] = [];
  const posizione = new Map<string, number>();
  risultati.forEach((r, indice) => {
    const chiave = r.category?.id ?? 'senza';
    let dove = posizione.get(chiave);
    if (dove === undefined) {
      dove = gruppi.length;
      posizione.set(chiave, dove);
      gruppi.push({ chiave, nome: r.category?.name ?? 'Senza categoria', indici: [] });
    }
    gruppi[dove]!.indici.push(indice);
  });

  return (
    <div className="space-y-4" aria-label="Prodotti da ordinare">
      {gruppi.map((gruppo) => (
        <section key={gruppo.chiave}>
          <h3 className="mb-2 flex items-baseline justify-between gap-2 px-1 text-xs font-bold tracking-wider text-neutral-500 uppercase">
            <span className="truncate">{gruppo.nome}</span>
            <span className="tabellare shrink-0 font-normal text-neutral-400">
              {gruppo.indici.length}
            </span>
          </h3>
          <ul className="space-y-2">
            {gruppo.indici.map((indice) => card(risultati[indice]!, indice))}
          </ul>
        </section>
      ))}
    </div>
  );
}
