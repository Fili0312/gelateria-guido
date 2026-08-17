'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';
import type { OrderApiBody, OrdineCorrente, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX } from '@/features/orders/schema';
import { CatalogFilters, raggruppa } from './catalog-filters';
import Link from 'next/link';
import { euro } from '@/features/products/format';
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
  const [reparto, setReparto] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [mutazioniInCorso, setMutazioniInCorso] = useState(0);

  const campo = useRef<HTMLInputElement>(null);
  const richiestaInCorso = useRef<AbortController | null>(null);
  const primaVolta = useRef(true);
  // Le mutazioni in volo, per chiave: la rete contro il doppio invio. Il
  // vincolo di unicità nel database impedisce il doppione comunque, ma qui si
  // evita anche il raddoppio involontario di quantità.
  const inVolo = useRef(new Set<string>());
  // Le route serializzano correttamente il database, ma due risposte HTTP
  // possono tornare in ordine inverso. Anche il client mette quindi le
  // mutazioni in coda: ogni risposta parte dallo stato restituito dalla
  // precedente e non puo' sovrascriverla con una fotografia piu' vecchia.
  const codaMutazioni = useRef<Promise<void>>(Promise.resolve());
  const ordineCorrente = useRef(ordineIniziale);

  const mostraOrdine = useCallback((successivo: OrdineCorrente) => {
    ordineCorrente.current = successivo;
    setOrdine(successivo);
  }, []);

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
        // Senza termine si carica **tutto** il catalogo: un tetto più basso
        // farebbe dire «289 su 300» quando i prodotti sono 326, e i conteggi
        // dei reparti sarebbero tagliati senza che si veda.
        url.searchParams.set('limite', q.trim() ? '40' : '500');
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
    (
      url: string,
      init: RequestInit,
      chiave: string,
      previsione?: (precedente: OrdineCorrente) => OrdineCorrente,
    ) => {
      if (inVolo.current.has(chiave)) return Promise.resolve();
      inVolo.current.add(chiave);
      setMutazioniInCorso((numero) => numero + 1);

      const esegui = async () => {
        const precedente = ordineCorrente.current;
        if (previsione) mostraOrdine(previsione(precedente));

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
            mostraOrdine(precedente);
            toast({
              title: 'Non è stato possibile aggiornare l’ordine',
              description: corpo.error,
              tone: 'error',
            });
            return;
          }
          mostraOrdine(corpo.data);
        } catch {
          mostraOrdine(precedente);
          toast({ title: 'Server non raggiungibile', tone: 'error' });
        } finally {
          inVolo.current.delete(chiave);
          setMutazioniInCorso((numero) => Math.max(0, numero - 1));
        }
      };

      const operazione = codaMutazioni.current.then(esegui, esegui);
      codaMutazioni.current = operazione.catch(() => {});
      return operazione;
    },
    [mostraOrdine, toast],
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

  const cambiaFornitore = useCallback(
    (rigaId: string, supplierProductId: string) =>
      muta(
        `${endpointOrdine}/lines/${rigaId}/switch-supplier`,
        { method: 'POST', body: JSON.stringify({ supplierProductId }) },
        `cambio:${rigaId}`,
      ),
    [endpointOrdine, muta],
  );

  const ignoraAvviso = useCallback(
    (rigaId: string) =>
      muta(
        `${endpointOrdine}/lines/${rigaId}`,
        { method: 'PATCH', body: JSON.stringify({ ignoraAvviso: true }) },
        `zittisci:${rigaId}`,
        (p) => ({
          ...p,
          righe: p.righe.map((r) => (r.id === rigaId ? { ...r, avvisoIgnorato: true } : r)),
        }),
      ),
    [endpointOrdine, muta],
  );

  const svuota = useCallback(
    () => muta(endpointOrdine, { method: 'DELETE' }, 'svuota', (p) => ({ ...p, righe: [] })),
    [endpointOrdine, muta],
  );

  // Reparti e categorie si calcolano su **tutto** ciò che è arrivato, non su
  // ciò che resta dopo il filtro: altrimenti scegliendo «Birre» sparirebbero
  // tutte le altre voci e non si potrebbe più tornare indietro.
  const { reparti, categoriePerReparto } = useMemo(() => raggruppa(risultati), [risultati]);
  // Con un reparto solo — «Bevande», che è il caso di questa gelateria — la
  // riga dei reparti non compare, ed è giusto: un filtro con una voce sola
  // non filtra niente. Ma le categorie sotto vanno mostrate lo stesso, o non
  // resta nessun filtro. Prima bisognava scegliere un reparto per vederle, e
  // quel reparto non c'era da scegliere.
  const categorie = reparto
    ? (categoriePerReparto.get(reparto) ?? [])
    : reparti.length === 1
      ? (categoriePerReparto.get(reparti[0]!.id) ?? [])
      : [];

  const mostrati = useMemo(() => {
    if (!reparto && !categoria) return risultati;
    return risultati.filter((r) => {
      if (reparto && (r.category?.departmentId ?? 'senza') !== reparto) return false;
      if (categoria && (r.category?.id ?? 'senza') !== categoria) return false;
      return true;
    });
  }, [risultati, reparto, categoria]);

  const perOfferta = useMemo(() => {
    const mappa = new Map<string, { rigaId: string; quantita: number }>();
    for (const riga of ordine.righe) {
      mappa.set(riga.supplierProductId, { rigaId: riga.id, quantita: riga.quantityPacks });
    }
    return mappa;
  }, [ordine.righe]);

  function tasti(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (mostrati.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setSelezione((s) => Math.min(s + 1, mostrati.length - 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setSelezione((s) => Math.max(s - 1, 0));
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      const offerta = mostrati[selezione]?.offerte[0];
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
    <div>
      {/* Il catalogo prende tutta la pagina.
          L'ordine stava in una colonna fissa a destra: venticinque
          centimetri sempre occupati da una cosa che si guarda alla fine,
          mentre l'elenco da cui si sceglie — quello su cui si passa tutto il
          tempo — stava stretto. Ora l'ordine è una barra in basso che si
          apre quando serve, e il resto è catalogo. */}
      <div>
        <div className="bg-neutral-50/95 sticky top-0 z-20 -mx-4 space-y-2.5 px-4 pt-1 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-2 lg:px-2">
          <div className="relative">
            <AppIcon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400"
            />
            <input
              ref={campo}
              type="text"
              value={termine}
              onChange={(e) => setTermine(e.target.value)}
              onKeyDown={tasti}
              placeholder="Cerca un prodotto, un codice, un sinonimo…"
              aria-label="Cerca nel catalogo"
              autoComplete="off"
              inputMode="search"
              className="focus:border-brand-500 focus:ring-brand-500/30 h-12 w-full rounded-xl border border-neutral-200 bg-white pr-11 pl-10 text-[15px] text-neutral-950 shadow-sm transition-colors outline-none placeholder:text-neutral-400 focus:ring-4"
            />
            {termine && (
              <button
                type="button"
                onClick={() => setTermine('')}
                aria-label="Azzera la ricerca"
                className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            )}
          </div>

          <CatalogFilters
            reparti={reparti}
            categorie={categorie}
            repartoScelto={reparto}
            categoriaScelta={categoria}
            onReparto={(id) => {
              setReparto(id);
              setCategoria(null);
              setSelezione(0);
            }}
            onCategoria={(id) => {
              setCategoria(id);
              setSelezione(0);
            }}
            totale={risultati.length}
          />

          <p className="flex items-center gap-2 text-xs text-neutral-500">
            <span>
              {cercando
                ? 'Sto cercando…'
                : `${mostrati.length} ${mostrati.length === 1 ? 'prodotto' : 'prodotti'}`}
              {mostrati.length !== risultati.length && ` su ${risultati.length}`}
            </span>
            <span className="text-neutral-300">·</span>
            <span>↑↓ per scegliere, Invio per aggiungere</span>
          </p>
        </div>

        <ProductRail
          risultati={mostrati}
          raggruppa={!categoria}
          selezione={selezione}
          perOfferta={perOfferta}
          onSeleziona={setSelezione}
          onAggiungi={aggiungi}
          onCambiaQuantita={cambiaQuantita}
          onRimuovi={rimuovi}
        />
      </div>

      {/* ── Il carrello, in basso ─────────────────────────────────────── */}
      {/* Chiuso dice quanto stai spendendo, aperto mostra cosa. La stima
          serve mentre si ordina — è il momento in cui si decide se togliere
          una cassa — e per averla non si deve smettere di scegliere. */}
      {/* `lg:pl-72` come il guscio: senza, la barra passa **sotto** il menu
          laterale e il totale finisce a metà fra le due cose. */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 lg:pl-72">
        <div className="mx-auto w-full max-w-[94rem] sm:px-1 xl:px-4">
          {schedaOrdine && (
            <div className="mb-2 max-h-[65vh] overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-900/20">
              <OrderPanel
                ordine={ordine}
                onCambiaQuantita={cambiaQuantita}
                onRimuovi={rimuovi}
                onSvuota={svuota}
                onCambiaFornitore={cambiaFornitore}
                onIgnoraAvviso={ignoraAvviso}
                inCorso={mutazioniInCorso > 0}
              />
            </div>
          )}

          <div className="flex items-stretch gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-xl shadow-neutral-900/15 backdrop-blur">
            <button
              type="button"
              onClick={() => setSchedaOrdine((v) => !v)}
              aria-expanded={schedaOrdine}
              className="focus-visible:ring-brand-600 flex min-h-12 flex-1 cursor-pointer items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none"
            >
              <AppIcon
                name="chevron"
                className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
                  schedaOrdine ? 'rotate-90' : '-rotate-90'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-900">
                  {t.righe === 0
                    ? 'Ordine vuoto'
                    : `${t.righe} ${t.righe === 1 ? 'prodotto' : 'prodotti'} · ${t.confezioni} conf.`}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {t.righe === 0
                    ? 'Premi + su un prodotto per cominciare'
                    : Number(t.ritornoAtteso) > 0
                      ? `${euro(t.ritornoAtteso)} torneranno indietro per gli sconti concordati`
                      : `${euro(t.lordo)} con IVA`}
                </span>
              </span>
              <span className="tabellare shrink-0 text-xl font-black text-neutral-950">
                {euro(t.netto)}
              </span>
            </button>

            <Link
              href="/ordini/riepilogo"
              aria-disabled={t.righe === 0}
              tabIndex={t.righe === 0 ? -1 : undefined}
              className={`inline-flex min-h-12 shrink-0 items-center rounded-xl px-4 text-sm font-semibold transition-colors ${
                t.righe === 0
                  ? 'pointer-events-none bg-neutral-100 text-neutral-400'
                  : 'bg-brand-600 hover:bg-brand-700 cursor-pointer text-white'
              }`}
            >
              Riepilogo
            </Link>
          </div>
        </div>
      </div>

      {/* Lo spazio sotto l'elenco, o le ultime righe finiscono dietro la barra. */}
      <div className="h-24" />
    </div>
  );
}
