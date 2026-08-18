'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';
import type { OrderApiBody, OrdineCorrente, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX } from '@/features/orders/schema';
import { raggruppa } from './catalog-filters';
import { CategoryRail } from './category-rail';
import { CatalogToolbar, FILTRI_VUOTI, type Filtri, type Ordinamento } from './catalog-toolbar';
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
  const [categoria, setCategoria] = useState<string | null>(null);
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_VUOTI);
  const [ordinamento, setOrdinamento] = useState<Ordinamento>('rilevanza');
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
    // Il campo si mette a fuoco da solo **solo dove c'è una tastiera**.
    //
    // Su un telefono non serve a niente — la tastiera di sistema non si apre
    // senza un tocco vero — e in cambio la pagina si apre con l'alone verde
    // acceso attorno alla ricerca, che è la prima cosa che si vede e sembra
    // un avviso. Su un computer invece si comincia a scrivere subito.
    if (window.matchMedia?.('(pointer: fine)').matches) campo.current?.focus();
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
  // Con un reparto solo — «Bevande», che è il caso di questa gelateria — il
  // filtro per reparto non compare, ed è giusto: un filtro con una voce sola
  // non filtra niente. Ma le categorie vanno mostrate lo stesso, o non resta
  // nessun filtro.
  const categorie = filtri.reparto
    ? (categoriePerReparto.get(filtri.reparto) ?? [])
    : reparti.length === 1
      ? (categoriePerReparto.get(reparti[0]!.id) ?? [])
      : [...categoriePerReparto.values()].flat().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  const mostrati = useMemo(() => {
    const filtrati = risultati.filter((r) => {
      if (filtri.reparto && (r.category?.departmentId ?? 'senza') !== filtri.reparto) return false;
      if (categoria && (r.category?.id ?? 'senza') !== categoria) return false;
      if (filtri.soloConfrontabili && !r.confrontato) return false;
      if (filtri.nascondiNonOrdinabili && r.offerte.length === 0) return false;
      return true;
    });

    // L'ordinamento è **nel browser**, sull'elenco già arrivato: cambiarlo
    // non fa aspettare niente. «Più rilevanti» non riordina affatto — è
    // l'ordine in cui il server li ha dati, che per una ricerca è la
    // pertinenza e per il catalogo intero è l'alfabeto.
    if (ordinamento === 'rilevanza') return filtrati;

    const prezzo = (r: (typeof filtrati)[number]) =>
      r.offerte[0] ? Number(r.offerte[0].prezzoEffettivo) : null;

    return [...filtrati].sort((a, b) => {
      if (ordinamento === 'nome') return a.name.localeCompare(b.name, 'it');
      const pa = prezzo(a);
      const pb = prezzo(b);
      // Chi non ha prezzo va in fondo in entrambi i versi: in cima a
      // «prezzo crescente» sembrerebbe il più conveniente di tutti.
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return ordinamento === 'prezzo-su' ? pa - pb : pb - pa;
    });
  }, [risultati, categoria, filtri, ordinamento]);

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
      <div>
        {/* ── La testa della pagina ────────────────────────────────────
            Ricerca, categorie e ordinamento restano appiccicati in cima:
            sono i tre comandi con cui si naviga, e scorrendo verso il
            quattrocentesimo prodotto devono restare a portata di pollice
            invece di obbligare a risalire. */}
        <div className="sticky top-0 z-20 -mx-4 space-y-3 bg-neutral-50/95 px-4 pt-1 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-2 lg:px-2">
          <div className="relative">
            <AppIcon
              name="search"
              className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-neutral-400"
            />
            <input
              ref={campo}
              type="text"
              value={termine}
              onChange={(e) => setTermine(e.target.value)}
              onKeyDown={tasti}
              placeholder="Cerca un prodotto…"
              aria-label="Cerca nel catalogo"
              autoComplete="off"
              inputMode="search"
              className="focus:border-brand-500 focus:ring-brand-500/30 h-[3.25rem] w-full rounded-[1.1rem] border border-neutral-200 bg-white pr-12 pl-11 text-neutral-950 transition-colors outline-none placeholder:text-neutral-400 focus:ring-4"
            />
            {termine && (
              <button
                type="button"
                onClick={() => setTermine('')}
                aria-label="Azzera la ricerca"
                className="absolute top-1/2 right-2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              >
                <span aria-hidden className="text-xl leading-none">
                  ×
                </span>
              </button>
            )}
          </div>

          <CategoryRail
            categorie={categorie}
            scelta={categoria}
            totale={risultati.length}
            onScegli={(id) => {
              setCategoria(id);
              setSelezione(0);
            }}
          />

          <CatalogToolbar
            reparti={reparti}
            filtri={filtri}
            onFiltri={(f) => {
              setFiltri(f);
              setSelezione(0);
            }}
            ordinamento={ordinamento}
            onOrdinamento={(o) => {
              setOrdinamento(o);
              setSelezione(0);
            }}
          />

          <p className="-mt-1 flex items-center gap-2 px-1 text-[13px] text-neutral-500">
            <span>
              {cercando
                ? 'Sto cercando…'
                : `${mostrati.length} ${mostrati.length === 1 ? 'prodotto' : 'prodotti'}`}
              {mostrati.length !== risultati.length && ` su ${risultati.length}`}
            </span>
            {/* Solo dove c'è una tastiera: su un telefono «Invio per
                aggiungere» è un'istruzione per un tasto che non esiste. */}
            <span className="hidden sm:inline">
              <span className="text-neutral-300">·</span> ↑↓ per scegliere, Invio per aggiungere
            </span>
          </p>
        </div>

        <ProductRail
          risultati={mostrati}
          raggruppa={!categoria && ordinamento === 'rilevanza'}
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
      <div className="pb-sicuro fixed inset-x-0 bottom-0 z-30 px-3 sm:px-6 lg:pl-72">
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

          <div
            className={`flex items-stretch gap-2 rounded-[1.25rem] border bg-white/95 p-2 shadow-lg shadow-neutral-900/10 backdrop-blur transition-colors ${
              t.righe === 0 ? 'border-neutral-200' : 'border-brand-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setSchedaOrdine((v) => !v)}
              aria-expanded={schedaOrdine}
              aria-label={schedaOrdine ? 'Chiudi il riepilogo dell’ordine' : 'Apri l’ordine'}
              className="focus-visible:ring-brand-600 flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-1.5 text-left transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none sm:gap-3"
            >
              {/* Il cestino col numero sopra: è il segno che tutti hanno già
                  imparato altrove, e dice quanto c'è dentro senza leggere. */}
              <span className="relative shrink-0">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-[0.9rem] ${
                    t.righe === 0 ? 'bg-neutral-100 text-neutral-400' : 'bg-brand-600 text-white'
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 8h16l-1.4 10.2A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.8L4 8Z" />
                    <path d="M8.5 8 12 3.5 15.5 8" />
                  </svg>
                </span>
                {t.confezioni > 0 && (
                  <span className="tabellare absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-neutral-900 px-1 text-[11px] font-bold text-white">
                    {t.confezioni}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-900">
                  {t.righe === 0
                    ? 'Ordine vuoto'
                    : `${t.righe} ${t.righe === 1 ? 'prodotto' : 'prodotti'} · ${t.confezioni} conf.`}
                </span>
                <span className="block truncate text-[12px] text-neutral-500">
                  {t.righe === 0
                    ? 'Premi + su un prodotto per cominciare'
                    : Number(t.ritornoAtteso) > 0
                      ? `${euro(t.ritornoAtteso)} di sconti concordati`
                      : 'più IVA'}
                </span>
              </span>

              {/* A ordine vuoto non c'è nessun totale da mostrare: «0,00 €»
                  non informa, e i suoi settanta pixel troncavano la scritta
                  accanto proprio quando serve leggerla per capire cosa fare. */}
              {t.righe > 0 && (
                <span className="tabellare shrink-0 text-lg font-extrabold text-neutral-950 sm:pr-1">
                  {euro(t.netto)}
                </span>
              )}
              {/* La freccia solo dove c'è spazio: su un telefono stretto è il
                  primo pezzo che si può togliere senza perdere niente, e
                  toglierlo è ciò che tiene «Vai all'ordine» dentro lo
                  schermo. */}
              <AppIcon
                name="chevron"
                className={`hidden h-4 w-4 shrink-0 text-neutral-400 transition-transform sm:block ${
                  schedaOrdine ? '-rotate-90' : 'rotate-90'
                }`}
              />
            </button>

            <Link
              href="/ordini/riepilogo"
              aria-disabled={t.righe === 0}
              tabIndex={t.righe === 0 ? -1 : undefined}
              className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-[0.9rem] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-4 ${
                t.righe === 0
                  ? 'pointer-events-none bg-neutral-100 text-neutral-400'
                  : 'bg-brand-600 hover:bg-brand-700 cursor-pointer text-white'
              }`}
            >
              <span className="hidden min-[380px]:inline">Vai all’ordine</span>
              <span className="min-[380px]:hidden">Ordine</span>
              <AppIcon name="arrow-right" className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>
      </div>

      {/* Lo spazio sotto l'elenco, o le ultime card finiscono dietro la barra. */}
      <div className="h-24" />
    </div>
  );
}
