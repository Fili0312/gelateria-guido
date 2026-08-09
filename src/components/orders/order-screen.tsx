'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, useToast } from '@/components/ui';
import type { OrderApiBody, OrdineCorrente, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX } from '@/features/orders/schema';
import { OrderPanel } from './order-panel';
import { ProductRail } from './product-rail';

/**
 * La schermata d'ordine, a due colonne.
 *
 * A sinistra il catalogo, sempre presente e già pieno all'apertura: chi
 * ordina spesso sa cosa gli serve e lo trova scorrendo, e una pagina che
 * comincia vuota costringe a inventarsi una parola da cercare. Scrivendo, la
 * stessa lista si restringe.
 *
 * A destra l'ordine, **fermo di fianco**. La barra che saliva dal basso
 * copriva l'ultima riga dell'elenco — proprio quella che si stava per
 * aggiungere — e per vedere cosa c'era dentro bisognava aprirla, coprendo
 * tutto il resto. Di fianco si vede sempre, e si continua ad aggiungere
 * guardandolo crescere.
 *
 * Su schermo stretto le due colonne diventano due schede: affiancarle sotto i
 * mille pixel darebbe due colonne inutilizzabili invece di una buona.
 */

const ATTESA_RICERCA_MS = 150;

export function OrderScreen({
  ordineIniziale,
  catalogoIniziale,
  endpointRicerca,
  endpointOrdine,
}: {
  ordineIniziale: OrdineCorrente;
  catalogoIniziale: RisultatoOrdinabile[];
  endpointRicerca: string;
  endpointOrdine: string;
}) {
  const { toast } = useToast();
  const [ordine, setOrdine] = useState(ordineIniziale);
  const [termine, setTermine] = useState('');
  const [risultati, setRisultati] = useState(catalogoIniziale);
  const [cercando, setCercando] = useState(false);
  const [selezione, setSelezione] = useState(0);
  const [schedaOrdine, setSchedaOrdine] = useState(false);

  const campo = useRef<HTMLInputElement>(null);
  const richiestaInCorso = useRef<AbortController | null>(null);
  const primaVolta = useRef(true);
  // Le mutazioni in volo, per chiave: la rete contro il doppio invio. Il
  // vincolo di unicità nel database impedisce il doppione comunque, ma qui si
  // evita anche il raddoppio involontario di quantità.
  const inVolo = useRef(new Set<string>());

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const cerca = useCallback(
    async (q: string) => {
      richiestaInCorso.current?.abort();
      const controller = new AbortController();
      richiestaInCorso.current = controller;
      setCercando(true);
      try {
        const url = new URL(endpointRicerca, window.location.origin);
        if (q.trim()) url.searchParams.set('q', q.trim());
        url.searchParams.set('limite', q.trim() ? '40' : '300');
        const risposta = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const corpo = (await risposta.json()) as OrderApiBody<RisultatoOrdinabile[]>;
        if (controller.signal.aborted) return;
        if (!corpo.ok) {
          toast({ title: 'Ricerca non riuscita', description: corpo.error, tone: 'error' });
          return;
        }
        setRisultati(corpo.data);
        setSelezione(0);
      } catch (errore) {
        if ((errore as Error).name === 'AbortError') return;
        toast({ title: 'Server non raggiungibile', tone: 'error' });
      } finally {
        if (!controller.signal.aborted) setCercando(false);
      }
    },
    [endpointRicerca, toast],
  );

  useEffect(() => {
    // Il catalogo iniziale arriva già dal server: rifare la stessa richiesta
    // al primo disegno sarebbe una chiamata per niente.
    if (primaVolta.current) {
      primaVolta.current = false;
      return;
    }
    const timer = setTimeout(() => void cerca(termine), ATTESA_RICERCA_MS);
    return () => clearTimeout(timer);
  }, [termine, cerca]);

  const muta = useCallback(
    async (
      url: string,
      init: RequestInit,
      chiave: string,
      previsione?: (precedente: OrdineCorrente) => OrdineCorrente,
    ) => {
      if (inVolo.current.has(chiave)) return;
      inVolo.current.add(chiave);
      const precedente = ordine;
      if (previsione) setOrdine(previsione(precedente));

      try {
        const risposta = await fetch(url, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...init.headers,
          },
        });
        const corpo = (await risposta.json()) as OrderApiBody<OrdineCorrente>;
        if (!corpo.ok) {
          setOrdine(precedente);
          toast({ title: 'Non è stato possibile aggiornare l’ordine', description: corpo.error, tone: 'error' });
          return;
        }
        setOrdine(corpo.data);
      } catch {
        setOrdine(precedente);
        toast({ title: 'Server non raggiungibile', tone: 'error' });
      } finally {
        inVolo.current.delete(chiave);
      }
    },
    [ordine, toast],
  );

  const aggiungi = useCallback(
    (supplierProductId: string) =>
      muta(
        `${endpointOrdine}/lines`,
        { method: 'POST', body: JSON.stringify({ supplierProductId, quantityPacks: 1 }) },
        `add:${supplierProductId}`,
      ),
    [endpointOrdine, muta],
  );

  const cambiaQuantita = useCallback(
    (rigaId: string, quantita: number) =>
      muta(
        `${endpointOrdine}/lines/${rigaId}`,
        { method: 'PATCH', body: JSON.stringify({ quantityPacks: quantita }) },
        `qta:${rigaId}`,
        (p) => ({
          ...p,
          righe: p.righe.map((r) => (r.id === rigaId ? { ...r, quantityPacks: quantita } : r)),
        }),
      ),
    [endpointOrdine, muta],
  );

  const rimuovi = useCallback(
    (rigaId: string) =>
      muta(`${endpointOrdine}/lines/${rigaId}`, { method: 'DELETE' }, `del:${rigaId}`, (p) => ({
        ...p,
        righe: p.righe.filter((r) => r.id !== rigaId),
      })),
    [endpointOrdine, muta],
  );

  const svuota = useCallback(
    () => muta(endpointOrdine, { method: 'DELETE' }, 'svuota', (p) => ({ ...p, righe: [] })),
    [endpointOrdine, muta],
  );

  const perOfferta = useMemo(() => {
    const mappa = new Map<string, { rigaId: string; quantita: number }>();
    for (const riga of ordine.righe) {
      mappa.set(riga.supplierProductId, { rigaId: riga.id, quantita: riga.quantityPacks });
    }
    return mappa;
  }, [ordine.righe]);

  function tasti(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (risultati.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setSelezione((s) => Math.min(s + 1, risultati.length - 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setSelezione((s) => Math.max(s - 1, 0));
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      const offerta = risultati[selezione]?.offerte[0];
      if (!offerta) return;
      const gia = perOfferta.get(offerta.supplierProductId);
      if (gia) void cambiaQuantita(gia.rigaId, Math.min(gia.quantita + 1, CONFEZIONI_MAX));
      else void aggiungi(offerta.supplierProductId);
    } else if (evento.key === 'Escape') {
      setTermine('');
    }
  }

  const t = ordine.totali;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
      {/* ── Colonna sinistra: il catalogo ─────────────────────────────── */}
      <div className={schedaOrdine ? 'hidden lg:block' : ''}>
        <div className="bg-neutral-50/95 sticky top-0 z-20 -mx-4 px-4 pt-1 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-2 lg:px-2">
          <Input
            ref={campo}
            label="Cerca"
            value={termine}
            onChange={(e) => setTermine(e.target.value)}
            onKeyDown={tasti}
            placeholder="Cerca per nome, sinonimo o codice…"
            autoComplete="off"
            inputMode="search"
            className="h-12"
          />
          <p className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
            <span>
              {cercando
                ? 'Sto cercando…'
                : `${risultati.length} ${risultati.length === 1 ? 'prodotto' : 'prodotti'}`}
            </span>
            <span className="text-neutral-300">·</span>
            <span>↑↓ e Invio per aggiungere</span>
            {termine && (
              <button
                type="button"
                onClick={() => setTermine('')}
                className="text-brand-700 ml-auto cursor-pointer font-semibold hover:underline"
              >
                Mostra tutti
              </button>
            )}
          </p>
        </div>

        <ProductRail
          risultati={risultati}
          selezione={selezione}
          perOfferta={perOfferta}
          onSeleziona={setSelezione}
          onAggiungi={aggiungi}
          onCambiaQuantita={cambiaQuantita}
        />
      </div>

      {/* ── Colonna destra: l'ordine ──────────────────────────────────── */}
      <aside className={`${schedaOrdine ? '' : 'hidden lg:block'} lg:sticky lg:top-4 lg:self-start`}>
        <OrderPanel
          ordine={ordine}
          onCambiaQuantita={cambiaQuantita}
          onRimuovi={rimuovi}
          onSvuota={svuota}
        />
      </aside>

      {/* Su schermo stretto si passa da una scheda all'altra: due colonne
          sotto i mille pixel non sono due colonne, sono due colonne strette. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setSchedaOrdine((v) => !v)}
          className="focus-visible:ring-brand-600 flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="font-semibold text-neutral-700">
            {schedaOrdine ? '← Torna al catalogo' : 'Vedi l’ordine'}
          </span>
          <span className="tabellare flex items-baseline gap-2">
            <span className="text-neutral-500">{t.confezioni} conf.</span>
            <span className="text-lg font-black text-neutral-950">
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
                Number(t.netto),
              )}
            </span>
          </span>
        </button>
      </div>
      <div className="h-16 lg:hidden" />
    </div>
  );
}
