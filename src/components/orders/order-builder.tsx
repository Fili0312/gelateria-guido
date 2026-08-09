'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, useToast } from '@/components/ui';
import type { OrderApiBody, OrdineCorrente, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX } from '@/features/orders/schema';
import { OrderBar } from './order-bar';
import { SearchResults } from './search-results';

/**
 * La schermata d'ordine.
 *
 * Deve essere veloce fino a sembrare banale, e «sembrare» è la parola giusta:
 * la velocità percepita non è la velocità del server.
 *
 * ── Tre accorgimenti, e cosa succederebbe senza ─────────────────────────
 *
 * **Debounce a 150 ms.** Senza, si parte a ogni tasto: dieci richieste per
 * «amaretto», nove delle quali inutili, e la decima in coda dietro le altre.
 *
 * **Annullamento della richiesta precedente.** Senza, le risposte possono
 * tornare fuori ordine e l'elenco mostrare i risultati di «amar» mentre nel
 * campo c'è scritto «amaretto». È il difetto peggiore di una ricerca a
 * digitazione: sembra che l'app abbia capito male.
 *
 * **Aggiornamento ottimistico.** La quantità cambia subito e la richiesta
 * parte dietro; se fallisce si torna indietro e lo si dice. Aspettare il
 * server a ogni `+` rende ogni clic un'attesa di duecento millisecondi, e su
 * trenta righe sono trenta attese.
 */

const ATTESA_RICERCA_MS = 150;

export function OrderBuilder({
  ordineIniziale,
  endpointRicerca,
  endpointOrdine,
}: {
  ordineIniziale: OrdineCorrente;
  endpointRicerca: string;
  endpointOrdine: string;
}) {
  const { toast } = useToast();
  const [ordine, setOrdine] = useState(ordineIniziale);
  const [termine, setTermine] = useState('');
  const [risultati, setRisultati] = useState<RisultatoOrdinabile[]>([]);
  const [cercando, setCercando] = useState(false);
  const [selezione, setSelezione] = useState(0);
  const [riepilogoAperto, setRiepilogoAperto] = useState(false);
  const [soloConfrontabili, setSoloConfrontabili] = useState(false);

  const campo = useRef<HTMLInputElement>(null);
  const richiestaInCorso = useRef<AbortController | null>(null);
  // Le mutazioni in volo, per offerta: è la rete contro il doppio invio.
  // Il database ha già il vincolo di unicità, ma qui si evita anche la
  // seconda richiesta — e con essa il raddoppio involontario di quantità.
  const inVolo = useRef(new Set<string>());

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const cerca = useCallback(
    async (q: string, filtro: boolean) => {
      richiestaInCorso.current?.abort();
      if (q.trim().length === 0) {
        setRisultati([]);
        setCercando(false);
        return;
      }

      const controller = new AbortController();
      richiestaInCorso.current = controller;
      setCercando(true);
      try {
        const url = new URL(endpointRicerca, window.location.origin);
        url.searchParams.set('q', q);
        if (filtro) url.searchParams.set('soloConfrontabili', 'true');
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
    const timer = setTimeout(() => void cerca(termine, soloConfrontabili), ATTESA_RICERCA_MS);
    return () => clearTimeout(timer);
  }, [termine, soloConfrontabili, cerca]);

  /** Ogni mutazione risponde con l'ordine intero: i totali non si sommano a mano. */
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
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
        });
        const corpo = (await risposta.json()) as OrderApiBody<OrdineCorrente>;
        if (!corpo.ok) {
          // Si torna esattamente allo stato di prima: un ordine che mostra una
          // riga che il server non ha è peggio di un errore.
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
    (supplierProductId: string, quante = 1) =>
      muta(
        `${endpointOrdine}/lines`,
        { method: 'POST', body: JSON.stringify({ supplierProductId, quantityPacks: quante }) },
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
        (precedente) => ({
          ...precedente,
          righe: precedente.righe.map((r) =>
            r.id === rigaId ? { ...r, quantityPacks: quantita } : r,
          ),
        }),
      ),
    [endpointOrdine, muta],
  );

  const rimuovi = useCallback(
    (rigaId: string) =>
      muta(
        `${endpointOrdine}/lines/${rigaId}`,
        { method: 'DELETE' },
        `del:${rigaId}`,
        (precedente) => ({
          ...precedente,
          righe: precedente.righe.filter((r) => r.id !== rigaId),
        }),
      ),
    [endpointOrdine, muta],
  );

  /** Quante confezioni di ogni offerta sono già nell'ordine. */
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
      const scelto = risultati[selezione];
      const offerta = scelto?.offerte[0];
      if (!offerta) return;
      const gia = perOfferta.get(offerta.supplierProductId);
      if (gia) void cambiaQuantita(gia.rigaId, Math.min(gia.quantita + 1, CONFEZIONI_MAX));
      else void aggiungi(offerta.supplierProductId);
    }
  }

  return (
    // Lo spazio in fondo lascia respirare la barra dei totali, che è fissa e
    // altrimenti coprirebbe l'ultimo risultato — proprio quello che si stava
    // per aggiungere.
    <div className="space-y-5 pb-40">
      <div className="sticky top-0 z-20 -mx-4 bg-neutral-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Input
          ref={campo}
          label="Cerca un prodotto"
          value={termine}
          onChange={(e) => setTermine(e.target.value)}
          onKeyDown={tasti}
          placeholder="birra, amaro, LA167, 20561…"
          autoComplete="off"
          inputMode="search"
          aria-describedby="aiuto-ricerca"
          className="h-14 text-lg"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p id="aiuto-ricerca" className="text-xs text-neutral-500">
            Nome, sinonimo, descrizione del fornitore o codice. ↑↓ per scegliere, Invio per
            aggiungere.
          </p>
          {/* L'area tappabile è l'etichetta, non il quadratino: sedici pixel
              si mancano col dito. L'etichetta è alta quarantaquattro e
              cliccarla commuta la casella. */}
          <label className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 px-1 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={soloConfrontabili}
              onChange={(e) => setSoloConfrontabili(e.target.checked)}
              className="text-brand-600 focus-visible:ring-brand-600 h-5 w-5 rounded border-neutral-300"
            />
            Solo con più fornitori
          </label>
        </div>
      </div>

      <SearchResults
        risultati={risultati}
        termine={termine}
        cercando={cercando}
        selezione={selezione}
        perOfferta={perOfferta}
        onSeleziona={setSelezione}
        onAggiungi={aggiungi}
        onCambiaQuantita={cambiaQuantita}
      />

      <OrderBar
        ordine={ordine}
        aperto={riepilogoAperto}
        onApri={() => setRiepilogoAperto((a) => !a)}
        onCambiaQuantita={cambiaQuantita}
        onRimuovi={rimuovi}
      />
    </div>
  );
}

