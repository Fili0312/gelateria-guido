import Link from 'next/link';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import type { ProductListItem } from '@/features/products/dto';
import {
  confezioneDelPrezzo,
  euro,
  formatoUnitario,
  numero,
  prezzoUnitarioDiCatalogo,
} from '@/features/products/format';
import { CategoryBadge } from '@/components/taxonomy/category-badge';

function Vuoto({ conFiltri }: { conFiltri: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
      <h2 className="text-lg font-black text-neutral-950">
        {conFiltri ? 'Nessun prodotto corrisponde ai filtri' : 'Il catalogo è vuoto'}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
        {conFiltri
          ? 'Prova a cambiare ricerca, categoria o stato.'
          : 'Il catalogo raccoglie i prodotti «canonici»: un articolo con il suo formato, ' +
            'a cui si collegano le offerte dei diversi fornitori. È quello che rende possibile confrontare i prezzi.'}
      </p>
      <Link
        href={conFiltri ? '/prodotti' : '/prodotti/nuovo'}
        className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 mt-5 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {conFiltri ? 'Azzera i filtri' : 'Nuovo prodotto'}
      </Link>
    </div>
  );
}

/**
 * Il numero di offerte è affiancato da quante sono confrontabili. Le due cifre
 * coincidono quasi sempre; quando non coincidono, la differenza è esattamente
 * ciò che impedisce un confronto di prezzo — e va vista subito, non scoperta
 * dopo in una schermata che dice «—».
 */
function Offerte({ prodotto }: { prodotto: ProductListItem }) {
  if (prodotto.offersCount === 0) {
    return <Badge variant="neutral">nessuna offerta</Badge>;
  }
  const incomplete = prodotto.offersCount - prodotto.comparableOffersCount;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold text-neutral-900">{prodotto.offersCount}</span>
      {incomplete > 0 && (
        <Badge
          variant="warning"
          title="Confezione non dichiarata: il prezzo per unità non è calcolabile"
        >
          {incomplete} da definire
        </Badge>
      )}
    </span>
  );
}

/**
 * Il prezzo, e subito sotto **a cosa si riferisce**.
 *
 * Le tre righe non sono ridondanti: il netto è quello che si paga, il prezzo
 * unitario è quello che si confronta, e la confezione è ciò che rende il primo
 * leggibile. Toglierne una lascia un numero che sembra chiaro e non lo è.
 */
function Prezzo({ prodotto }: { prodotto: ProductListItem }) {
  const p = prodotto.price;
  if (!p) {
    return (
      <span className="text-sm text-neutral-400" title="Nessuna offerta attiva ha un prezzo">
        —
      </span>
    );
  }

  const unitario = prezzoUnitarioDiCatalogo(p);
  // Solo elementi in linea: su telefono questo blocco sta dentro il `<a>`
  // della scheda, e un `<div>` dentro uno `<span>` è annidamento non valido —
  // il genere di errore che si manifesta solo in idratazione, a pagina viva.
  return (
    <span className="block min-w-40">
      <span className="flex items-baseline gap-2">
        <span className="tabellare font-semibold text-neutral-950">{euro(p.priceNet)}</span>
        {p.compared && p.savingPct && Number(p.savingPct) > 0 && (
          <Badge
            variant="success"
            title={`Costa il ${numero(p.savingPct, 1)}% in meno dell’offerta più cara`}
          >
            {`−${numero(p.savingPct, 1)}%`}
          </Badge>
        )}
      </span>
      <span className="tabellare mt-0.5 block text-xs text-neutral-600">
        {unitario ?? (
          <span
            className="text-amber-700"
            title="Senza i pezzi per confezione il prezzo per litro sarebbe calcolato su un numero inventato"
          >
            confezione da definire
          </span>
        )}
      </span>
      <span className="mt-1 block text-xs text-neutral-500">
        {`${confezioneDelPrezzo(p)} · ${p.supplierName}`}
      </span>
      {p.offersWithPrice > 1 && (
        <span className="mt-0.5 block text-xs text-neutral-400">
          {p.compared
            ? `il più conveniente fra ${p.offersWithPrice}`
            : `${p.offersWithPrice} offerte, non confrontabili`}
        </span>
      )}
    </span>
  );
}

export function ProductList({
  items,
  conFiltri,
}: {
  items: ProductListItem[];
  conFiltri: boolean;
}) {
  if (items.length === 0) return <Vuoto conFiltri={conFiltri} />;

  return (
    <>
      {/* Su schermo stretto la tabella diventa un elenco di schede: la
          decisione D12 mette il telefono fra i dispositivi previsti. */}
      <ul className="space-y-3 md:hidden" aria-label="Elenco prodotti">
        {items.map((prodotto) => (
          <li key={prodotto.id}>
            <Link
              href={`/prodotti/${prodotto.id}`}
              className="focus-visible:ring-brand-600 block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="block font-semibold text-neutral-950">{prodotto.name}</span>
              <span className="mt-1 block text-sm text-neutral-500">
                {formatoUnitario(prodotto.unitSize, prodotto.unitOfMeasure)}
              </span>
              <span className="mt-2 block">
                <CategoryBadge categoria={prodotto.category} />
              </span>
              <span className="mt-3 block border-t border-neutral-100 pt-3">
                <Prezzo prodotto={prodotto} />
              </span>
              <span className="mt-3 flex items-center gap-2 text-sm">
                <Offerte prodotto={prodotto} />
                <span className="text-neutral-400">offerte</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prodotto</TableHead>
              <TableHead>Formato</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Prezzo e confezione</TableHead>
              <TableHead>Offerte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((prodotto) => (
              <TableRow key={prodotto.id}>
                <TableCell>
                  <Link
                    href={`/prodotti/${prodotto.id}`}
                    className="focus-visible:ring-brand-600 font-semibold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {prodotto.name}
                  </Link>
                  {prodotto.createdBy === 'AI' && (
                    <Badge variant="neutral" className="ml-2">
                      creato dall’IA
                    </Badge>
                  )}
                  {prodotto.brand && (
                    <span className="mt-0.5 block text-xs text-neutral-500">{prodotto.brand}</span>
                  )}
                </TableCell>
                <TableCell className="tabellare">
                  {formatoUnitario(prodotto.unitSize, prodotto.unitOfMeasure)}
                </TableCell>
                <TableCell>
                  <CategoryBadge categoria={prodotto.category} />
                </TableCell>
                <TableCell>
                  <Prezzo prodotto={prodotto} />
                </TableCell>
                <TableCell>
                  <Offerte prodotto={prodotto} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
