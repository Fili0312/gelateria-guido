'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { aCosaSiRiferisce, ColloBadge } from './collo-badge';
import { DiscountToggle } from './discount-toggle';
import { PackagingQuickSet } from './packaging-quick-set';
import { useToast } from '@/components/ui';
import type { ProductListItem } from '@/features/products/dto';
import { euro, formatoUnitario, numero } from '@/features/products/format';

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
function Prezzo({ prodotto }: { prodotto: ProductListItem }) {
  const p = prodotto.price;
  if (!p) {
    return <span className="text-xs text-neutral-400">senza prezzo</span>;
  }

  return (
    <span className="flex items-baseline justify-end gap-2">
      {p.compared && p.savingPct && Number(p.savingPct) > 0 && (
        <span
          className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800"
          title={`Il più conveniente fra ${p.offersWithPrice}: costa il ${numero(p.savingPct, 1)}% in meno del più caro`}
        >
          −{numero(p.savingPct, 1)}%
        </span>
      )}
      <span className="text-right">
        <span className="tabellare block text-base leading-5 font-bold text-neutral-950">
          {euro(p.priceNet)}
        </span>
        {/* A cosa si riferisce la cifra. Senza, «4,72 €» può essere la
            bottiglia o il collo da ventiquattro: due letture che differiscono
            di ventiquattro volte. */}
        <span className="block text-xs leading-4 text-neutral-400">{aCosaSiRiferisce(p)}</span>
      </span>
    </span>
  );
}

function Riga({
  prodotto,
  endpoint,
  endpointOfferte,
  endpointConfezioni,
}: {
  prodotto: ProductListItem;
  endpoint: string;
  endpointOfferte: string;
  endpointConfezioni: string;
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
      const corpo = (await risposta.json().catch(() => null)) as {
        ok: boolean;
        error?: string;
      } | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({
          title: 'Non è stato possibile eliminare',
          description: corpo?.error,
          tone: 'error',
        });
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

  return (
    <li className="group hover:bg-brand-50/50 flex items-center gap-3 px-3 py-2.5 transition-colors">
      <div className="min-w-0 flex-1">
        <Link
          href={`/prodotti/${prodotto.id}`}
          className="focus-visible:ring-brand-600 block cursor-pointer truncate text-sm font-semibold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {prodotto.name}
        </Link>
        {/* La seconda riga risponde a una domanda sola: cosa arriva se ne
            ordino una. Il formato del pezzo sta dentro l'etichetta del collo
            e non anche accanto al nome — scritto due volte non informa il
            doppio, occupa il doppio. La categoria è sparita: si filtra da
            lassù, e ripeterla su ogni riga aggiungeva colore e non notizie. */}
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {prodotto.price ? (
            <ColloBadge
              confezione={prodotto.price}
              onDefinisci={
                <PackagingQuickSet
                  supplierProductId={prodotto.price.supplierProductId}
                  supplierName={prodotto.price.supplierName}
                  endpoint={endpointConfezioni}
                />
              }
            />
          ) : (
            <span className="text-xs text-neutral-500">
              {formatoUnitario(prodotto.unitSize, prodotto.unitOfMeasure)}
            </span>
          )}
          {prodotto.price && (
            <span className="text-xs text-neutral-400">{prodotto.price.supplierName}</span>
          )}
          {prodotto.brand && <span className="text-xs text-neutral-400">{prodotto.brand}</span>}
        </p>
      </div>

      <span className="shrink-0">
        <Prezzo prodotto={prodotto} />
      </span>

      {/* Solo dove c'è un accordo: il comando compare accanto al prodotto e
          si preme scorrendo, senza aprire niente. */}
      {prodotto.scontabili.length > 0 && (
        <span className="flex shrink-0 flex-wrap items-center gap-1">
          {prodotto.scontabili.map((o) => (
            <DiscountToggle
              key={o.supplierProductId}
              offerta={o}
              endpoint={endpointOfferte}
              mostraFornitore={prodotto.scontabili.length > 1}
            />
          ))}
        </span>
      )}

      {/* Quante offerte: è il segnale che dice se il prezzo mostrato è una
          scelta fra alternative o l'unico che c'è. «Da definire» non si
          ripete qui — lo dice già l'etichetta ambra sulla riga sopra. */}
      <span className="hidden w-20 shrink-0 text-right text-xs sm:block">
        {prodotto.offersCount === 0 ? (
          <span className="text-neutral-400">nessuna offerta</span>
        ) : prodotto.comparableOffersCount > 1 ? (
          <span className="font-semibold text-emerald-700">
            {prodotto.comparableOffersCount} a confronto
          </span>
        ) : (
          <span className="text-neutral-400">
            {prodotto.offersCount} {prodotto.offersCount === 1 ? 'offerta' : 'offerte'}
          </span>
        )}
      </span>

      {/* Le azioni restano sempre nello stesso posto, anche quando non sono
          evidenziate: farle comparire solo al passaggio del mouse le rende
          invisibili su tablet, dove il mouse non c'è. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <Azione
          href={`/prodotti/${prodotto.id}`}
          icona="arrow-right"
          titolo={`Apri ${prodotto.name}`}
        />
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
      <h2 className="text-lg font-extrabold text-neutral-950">
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
  endpointConfezioni,
}: {
  items: ProductListItem[];
  conFiltri: boolean;
  endpoint: string;
  endpointOfferte: string;
  endpointConfezioni: string;
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
          endpointConfezioni={endpointConfezioni}
        />
      ))}
    </ul>
  );
}
