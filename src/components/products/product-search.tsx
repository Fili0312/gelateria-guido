'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui';
import type { ProductApiBody, ProductSearchResult } from '@/features/products/dto';
import { formatoUnitario } from '@/features/products/format';

/**
 * La barra di ricerca del catalogo.
 *
 * È il primo abbozzo di quella che nella Fase 12 diventerà la schermata
 * ordine, e ne ha già i vincoli della decisione D12: campo grande, risultati
 * navigabili da tastiera (frecce e invio, senza toccare il mouse), bersagli
 * comodi al tocco.
 *
 * L'attesa fra un tasto e la chiamata è breve di proposito. Non serve a
 * risparmiare al server: serve a non far lampeggiare l'elenco mentre si
 * scrive. Ogni richiesta annulla la precedente, così una risposta lenta non
 * può arrivare dopo una più recente e sovrascriverla — il tipo di guasto che
 * si manifesta solo su rete lenta e che poi nessuno riesce a riprodurre.
 */

const ATTESA_MS = 150;

export function ProductSearch({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [termine, setTermine] = useState('');
  const [esito, setEsito] = useState<ProductSearchResult | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [evidenziato, setEvidenziato] = useState(-1);
  const annulla = useRef<AbortController | null>(null);

  const termineRipulito = termine.trim();
  const vuoto = termineRipulito === '';

  useEffect(() => {
    // Con il campo vuoto non si azzera lo stato qui dentro: React lo
    // considera un aggiornamento a cascata, e ha ragione. Basta non
    // mostrarlo — vedi `risultati` piu' sotto — e la prossima ricerca lo
    // sostituisce.
    if (vuoto) {
      annulla.current?.abort();
      return;
    }
    const q = termineRipulito;

    const timer = setTimeout(async () => {
      annulla.current?.abort();
      const controller = new AbortController();
      annulla.current = controller;
      setCaricamento(true);
      try {
        const risposta = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&limite=20`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const corpo = (await risposta
          .json()
          .catch(() => null)) as ProductApiBody<ProductSearchResult> | null;
        if (!risposta.ok || !corpo?.ok) {
          setErrore(corpo && !corpo.ok ? corpo.error : 'La ricerca non è riuscita.');
          setEsito(null);
          return;
        }
        setErrore(null);
        setEsito(corpo.data);
        setEvidenziato(-1);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErrore('Server non raggiungibile.');
      } finally {
        if (!controller.signal.aborted) setCaricamento(false);
      }
    }, ATTESA_MS);

    return () => clearTimeout(timer);
  }, [termineRipulito, vuoto, endpoint]);

  const risultati = vuoto ? [] : (esito?.items ?? []);

  function tastiera(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (risultati.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setEvidenziato((i) => (i + 1) % risultati.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setEvidenziato((i) => (i <= 0 ? risultati.length - 1 : i - 1));
    } else if (evento.key === 'Enter' && evidenziato >= 0) {
      evento.preventDefault();
      const scelto = risultati[evidenziato];
      // `router.push` applica da solo il basePath; costruire l'URL a mano
      // significherebbe duplicarne la logica in un punto in piu'.
      if (scelto) router.push(`/prodotti/${scelto.id}`);
    } else if (evento.key === 'Escape') {
      setTermine('');
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <Input
        id="ricerca-catalogo"
        label="Cerca nel catalogo"
        hint="Nome, sinonimi, descrizione del fornitore o codice articolo. Ignora accenti e maiuscole."
        type="search"
        autoComplete="off"
        className="text-base"
        placeholder="Per esempio: birra, amaro, LA167…"
        value={termine}
        onChange={(e) => setTermine(e.target.value)}
        onKeyDown={tastiera}
        aria-describedby="ricerca-esito"
      />

      <p id="ricerca-esito" className="mt-2 text-xs text-neutral-500" aria-live="polite">
        {vuoto
          ? 'Digita almeno una lettera.'
          : errore
            ? errore
            : caricamento
              ? 'Cerco…'
              : esito
                ? `${risultati.length} risultati in ${esito.elapsedMs} ms · ` +
                  `cercato «${esito.normalized}» per ${esito.strategy}`
                : 'Cerco…'}
      </p>

      {risultati.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {risultati.map((hit, indice) => (
            <li key={hit.id}>
              <Link
                href={`/prodotti/${hit.id}`}
                className={`focus-visible:ring-brand-600 flex min-h-tap items-center justify-between gap-3 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none ${
                  indice === evidenziato ? 'bg-brand-50' : 'hover:bg-neutral-50'
                }`}
                onMouseEnter={() => setEvidenziato(indice)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-900">{hit.name}</span>
                  <span className="block text-xs text-neutral-500">
                    {formatoUnitario(hit.unitSize, hit.unitOfMeasure)}
                    {hit.category
                      ? ` · ${hit.category.departmentName} · ${hit.category.name}`
                      : ''}{' '}
                    · {hit.offersCount} offerte
                  </span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400">{hit.via}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
