'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { CategoryBadge } from '@/components/taxonomy/category-badge';
import { PackagingQuickSet } from './packaging-quick-set';
import { useToast } from '@/components/ui';
import type { ProductListItem } from '@/features/products/dto';
import {
  confezioneDelPrezzo,
  etichettaBasis,
  euro,
  formatoUnitario,
  numero,
} from '@/features/products/format';

/**
 * Il catalogo: una riga per prodotto, densa.
 *
 * Prima era una scheda alta ottanta pixel: su trecento prodotti significava
 * vederne sei per schermata e scorrere all'infinito. Ora tutto quello che
 * serve a riconoscere un prodotto sta su due righe di testo, e le azioni sono
 * tre icone a destra sempre nello stesso posto — la mano impara dove sono e
 * smette di cercarle.
 *
 * Cosa deve dire una riga, in ordine di importanza: **cos'è**, **quanto
 * costa**, **a cosa si riferisce quel prezzo**. La confezione sta accanto al
 * prezzo perché «4,72 €» letto come bottiglia quando è un collo da 24 sbaglia
 * di ventiquattro volte.
 */

function Azione({
  href,
  onClick,
  icona,
  titolo,
  pericolo = false,
}: {
  href?: string;
  onClick?: () => void;
  icona: 'arrow-right' | 'edit' | 'trash';
  titolo: string;
  pericolo?: boolean;
}) {
  const classi = `grid h-9 w-9 place-items-center rounded-lg transition-colors ${
    pericolo
      ? 'text-neutral-400 hover:bg-red-50 hover:text-red-600'
      : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800'
  }`;

  const contenuto = <AppIcon name={icona} className="h-4 w-4" />;

  return href ? (
    <Link href={href} title={titolo} aria-label={titolo} className={`cursor-pointer ${classi}`}>
      {contenuto}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      title={titolo}
      aria-label={titolo}
      className={`cursor-pointer ${classi}`}
    >
      {contenuto}
    </button>
  );
}

/** Il prezzo e la confezione, su una riga sola. */
function Prezzo({ prodotto, endpointOfferte }: { prodotto: ProductListItem; endpointOfferte: string }) {
  const p = prodotto.price;
  if (!p) {
    return <span className="text-xs text-neutral-400">senza prezzo</span>;
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="tabellare text-sm font-bold text-neutral-950">{euro(p.priceNet)}</span>
      {p.unitPrice && p.unitPriceBasis ? (
        <span className="tabellare text-xs text-neutral-400">
          {`${euro(p.unitPrice, 4)}${etichettaBasis(p.unitPriceBasis).slice(1)}`}
        </span>
      ) : (
        <PackagingQuickSet
          supplierProductId={p.supplierProductId}
          supplierName={p.supplierName}
          endpoint={endpointOfferte}
        />
      )}
      <span className="text-xs text-neutral-500">{confezioneDelPrezzo(p)}</span>
      <span className="text-xs text-neutral-400">{p.supplierName}</span>
      {p.compared && p.savingPct && Number(p.savingPct) > 0 && (
        <span
          className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-semibold text-green-800"
          title={`Il più conveniente fra ${p.offersWithPrice}: costa il ${numero(p.savingPct, 1)}% in meno del più caro`}
        >
          −{numero(p.savingPct, 1)}%
        </span>
      )}
    </span>
  );
}

function Riga({
  prodotto,
  endpoint,
  endpointOfferte,
}: {
  prodotto: ProductListItem;
  endpoint: string;
  endpointOfferte: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);

  async function elimina() {
    if (
      !confirm(
        `Eliminare «${prodotto.name}»?\n\n` +
          (prodotto.offersCount > 0
            ? `Ci sono ${prodotto.offersCount} offerte collegate: resteranno senza prodotto e andranno riabbinate.`
            : 'Non ha offerte collegate.'),
      )
    ) {
      return;
    }
    setAttesa(true);
    try {
      const risposta = await fetch(`${endpoint}/${prodotto.id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const corpo = (await risposta.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({ title: 'Non è stato possibile eliminare', description: corpo?.error, tone: 'error' });
        return;
      }
      toast({ title: 'Prodotto eliminato', tone: 'success' });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  const incomplete = prodotto.offersCount - prodotto.comparableOffersCount;

  return (
    <li className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-neutral-50">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/prodotti/${prodotto.id}`}
            className="focus-visible:ring-brand-600 cursor-pointer truncate text-sm font-semibold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {prodotto.name}
          </Link>
          <span className="text-xs text-neutral-500">
            {formatoUnitario(prodotto.unitSize, prodotto.unitOfMeasure)}
          </span>
          {prodotto.brand && <span className="text-xs text-neutral-400">{prodotto.brand}</span>}
          <CategoryBadge categoria={prodotto.category} />
        </p>
        <p className="mt-0.5">
          <Prezzo prodotto={prodotto} endpointOfferte={endpointOfferte} />
        </p>
      </div>

      <span className="hidden w-24 shrink-0 text-right text-xs text-neutral-500 sm:block">
        {prodotto.offersCount === 0 ? (
          <span className="text-neutral-400">nessuna offerta</span>
        ) : (
          <>
            {prodotto.offersCount} {prodotto.offersCount === 1 ? 'offerta' : 'offerte'}
            {incomplete > 0 && (
              <span
                className="block text-amber-600"
                title="Confezione non dichiarata: non entrano nel confronto"
              >
                {incomplete} da definire
              </span>
            )}
          </>
        )}
      </span>

      {/* Le azioni restano sempre nello stesso posto, anche quando non sono
          evidenziate: farle comparire solo al passaggio del mouse le rende
          invisibili su tablet, dove il mouse non c'è. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <Azione href={`/prodotti/${prodotto.id}`} icona="arrow-right" titolo={`Apri ${prodotto.name}`} />
        <Azione
          href={`/prodotti/${prodotto.id}/modifica`}
          icona="edit"
          titolo={`Modifica ${prodotto.name}`}
        />
        <Azione
          onClick={attesa ? undefined : elimina}
          icona="trash"
          titolo={`Elimina ${prodotto.name}`}
          pericolo
        />
      </span>
    </li>
  );
}

function Vuoto({ conFiltri }: { conFiltri: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
      <h2 className="text-lg font-black text-neutral-950">
        {conFiltri ? 'Nessun prodotto corrisponde ai filtri' : 'Il catalogo è vuoto'}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
        {conFiltri
          ? 'Prova a cambiare ricerca, categoria o stato.'
          : 'Il catalogo raccoglie i prodotti «canonici»: un articolo col suo formato, a cui si ' +
            'collegano le offerte dei diversi fornitori. È quello che rende possibile confrontare i prezzi.'}
      </p>
      <Link
        href={conFiltri ? '/prodotti' : '/prodotti/nuovo'}
        className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {conFiltri ? 'Azzera i filtri' : 'Nuovo prodotto'}
      </Link>
    </div>
  );
}

export function ProductList({
  items,
  conFiltri,
  endpoint,
  endpointOfferte,
}: {
  items: ProductListItem[];
  conFiltri: boolean;
  endpoint: string;
  endpointOfferte: string;
}) {
  if (items.length === 0) return <Vuoto conFiltri={conFiltri} />;

  return (
    <ul
      className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white"
      aria-label="Elenco prodotti"
    >
      {items.map((prodotto) => (
        <Riga
          key={prodotto.id}
          prodotto={prodotto}
          endpoint={endpoint}
          endpointOfferte={endpointOfferte}
        />
      ))}
    </ul>
  );
}
