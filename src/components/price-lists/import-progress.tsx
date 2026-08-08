'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, useToast } from '@/components/ui';
import type { PriceListApiBody, PriceListDetail, StatoLavorazione } from '@/features/price-lists/dto';

/**
 * L'avanzamento della lavorazione.
 *
 * Interroga il server finché la fase non è terminale, poi smette. Non usa
 * niente di più sofisticato di una richiesta ogni due secondi: un canale
 * aperto (SSE o websocket) attraverso nginx e systemd porterebbe con sé una
 * classe di guasti — connessioni mezze chiuse, riavvii, buffer del proxy —
 * per guadagnare qualche secondo su un'operazione che ne dura dieci.
 *
 * Lo stato che conta di più non è «a che punto è» ma **«sta ancora
 * lavorando?»**: un job il cui ultimo segno di vita è vecchio appartiene a un
 * processo che non c'è più, e viene dichiarato interrotto invece di restare
 * per sempre a metà barra.
 */

const ATTESA_MS = 2000;

const ETICHETTE: Record<string, string> = {
  QUEUED: 'In coda',
  EXTRACTING: 'Leggo il PDF',
  SEGMENTING: 'Individuo le righe',
  STRUCTURING: 'Interpreto i campi',
  VALIDATING: 'Controllo i valori',
  MATCHING: 'Abbino ai prodotti',
  DONE: 'Estrazione completata',
  FAILED: 'Non riuscita',
  CANCELLED: 'Annullata',
};

function terminale(fase: string): boolean {
  return fase === 'DONE' || fase === 'FAILED' || fase === 'CANCELLED';
}

export function ImportProgress({
  iniziale,
  endpoint,
  endpointAnnulla,
}: {
  iniziale: PriceListDetail;
  endpoint: string;
  endpointAnnulla: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [listino, setListino] = useState(iniziale);
  const [attesa, setAttesa] = useState(false);

  const lavorazione: StatoLavorazione | null = listino.lavorazione;
  const finito = !lavorazione || terminale(lavorazione.fase);

  useEffect(() => {
    if (finito) return;
    let vivo = true;

    const timer = setInterval(async () => {
      try {
        const risposta = await fetch(endpoint, { headers: { Accept: 'application/json' } });
        const corpo = (await risposta.json()) as PriceListApiBody<PriceListDetail>;
        if (!vivo || !corpo.ok) return;
        setListino(corpo.data);
        if (corpo.data.lavorazione && terminale(corpo.data.lavorazione.fase)) {
          // Le righe le rende il server: quando la lavorazione finisce va
          // ricaricata la pagina, non solo aggiornata la barra.
          router.refresh();
        }
      } catch {
        // Una richiesta persa non è un guasto: la prossima riprova.
      }
    }, ATTESA_MS);

    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [finito, endpoint, router]);

  async function annulla() {
    if (!confirm('Fermare la lavorazione? Le righe già estratte restano visibili.')) return;
    setAttesa(true);
    try {
      const risposta = await fetch(endpointAnnulla, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const corpo = (await risposta.json().catch(() => null)) as PriceListApiBody<unknown> | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({
          title: 'Non è stato possibile annullare',
          description: corpo && !corpo.ok ? corpo.error : undefined,
          tone: 'error',
        });
        return;
      }
      toast({ title: 'Lavorazione fermata', tone: 'success' });
      router.refresh();
    } finally {
      setAttesa(false);
    }
  }

  if (!lavorazione) return null;

  const etichetta = ETICHETTE[lavorazione.fase] ?? lavorazione.fase;
  const percentuale = lavorazione.percentuale ?? 0;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-black text-neutral-950">{etichetta}</h2>
          {lavorazione.fase === 'DONE' && <Badge variant="success">pronto</Badge>}
          {lavorazione.fase === 'FAILED' && <Badge variant="danger">errore</Badge>}
          {lavorazione.fase === 'CANCELLED' && <Badge variant="neutral">annullata</Badge>}
          {lavorazione.interrotto && <Badge variant="warning">interrotta</Badge>}
        </div>
        {!finito && (
          <Button type="button" variant="ghost" size="sm" onClick={annulla} disabled={attesa}>
            Ferma
          </Button>
        )}
      </div>

      {!finito && (
        <>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-valuenow={percentuale}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avanzamento della lavorazione"
          >
            <div
              className="bg-brand-600 h-full transition-[width] duration-500"
              style={{ width: `${Math.max(percentuale, 4)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-neutral-500">
            {lavorazione.totale > 0
              ? `${lavorazione.fatto} di ${lavorazione.totale} righe scritte`
              : 'Sto leggendo il documento…'}
          </p>
        </>
      )}

      {lavorazione.interrotto && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
          La lavorazione non dà segni di vita: molto probabilmente il servizio è stato riavviato
          mentre lavorava. Riparte da sola al prossimo avvio, dal punto in cui era arrivata.
        </p>
      )}

      {lavorazione.errore && (
        <p className="text-aumento mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6">
          {lavorazione.errore}
        </p>
      )}
    </section>
  );
}
