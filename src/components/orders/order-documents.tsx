'use client';

import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { Button, useToast } from '@/components/ui';
import type { OrderApiBody } from '@/features/orders/dto';
import type { DocumentoInElenco } from '@/server/repositories/order-documents';

/**
 * I documenti dell'ordine: generarli e riscaricarli.
 *
 * ── Perché generare è un gesto e non un automatismo ─────────────────────
 * Si potrebbe produrre tutto alla conferma. Ma confermare e stampare
 * falliscono per ragioni diverse — un prezzo sparito la prima, un browser che
 * non parte la seconda — e legarle vuol dire che Chromium impedisce di
 * confermare un ordine. Separate, un guasto della stampa lascia l'ordine
 * confermato e si ritenta il documento.
 *
 * ── I precedenti restano ────────────────────────────────────────────────
 * Rigenerando, i file di prima non spariscono. Quando il fornitore contesta
 * una riga si discute sul documento che gli è arrivato, e quello deve esserci
 * ancora.
 */

function peso(byte: number): string {
  return byte < 1024
    ? `${byte} B`
    : byte < 1024 * 1024
      ? `${Math.round(byte / 1024)} kB`
      : `${(byte / 1024 / 1024).toFixed(1)} MB`;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderDocuments({
  orderId,
  iniziali,
  endpointOrdini,
  generabile = true,
}: {
  orderId: string;
  iniziali: DocumentoInElenco[];
  endpointOrdini: string;
  generabile?: boolean;
}) {
  const { toast } = useToast();
  const [documenti, setDocumenti] = useState(iniziali);
  const [attesa, setAttesa] = useState(false);

  const base = `${endpointOrdini}/${orderId}/documents`;
  // La generazione più recente in cima; le precedenti sotto, sbiadite.
  const generazioneCorrente = documenti[0]?.createdAt ?? null;

  async function genera() {
    setAttesa(true);
    try {
      const risposta = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({}),
      });
      const corpo = (await risposta.json()) as OrderApiBody<DocumentoInElenco[]>;
      if (!corpo.ok) {
        toast({ title: 'Documenti non generati', description: corpo.error, tone: 'error' });
        return;
      }
      const nuovi = corpo.data.filter((d) => d.createdAt === corpo.data[0]?.createdAt);
      setDocumenti(corpo.data);
      toast({
        title: `${nuovi.length} ${nuovi.length === 1 ? 'documento pronto' : 'documenti pronti'}`,
        description: 'Disponibili singolarmente o in un unico archivio.',
        tone: 'success',
      });
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-neutral-950">Documenti per i fornitori</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">
            Un PDF per ogni fornitore, con i suoi articoli e il suo totale, più il riepilogo in
            Excel di tutto l’ordine. I prezzi sono quelli congelati alla conferma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {documenti.length > 0 && (
            <a
              href={`${base}/archivio`}
              className="focus-visible:ring-brand-600 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
            >
              <AppIcon name="download" className="h-4 w-4" />
              Scarica tutto
            </a>
          )}
          {generabile && (
            <Button onClick={() => void genera()} disabled={attesa} className="min-h-11">
              {attesa
                ? 'Sto preparando…'
                : documenti.length > 0
                  ? 'Rigenera'
                  : 'Genera i documenti'}
            </Button>
          )}
        </div>
      </div>

      {!generabile && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ordine annullato: i documenti già prodotti restano scaricabili, ma non si possono
          rigenerare.
        </p>
      )}

      {documenti.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
          Nessun documento generato per questo ordine.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100">
          {documenti.map((d) => {
            const vecchio = d.createdAt !== generazioneCorrente;
            return (
              <li
                key={d.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-3 ${vecchio ? 'opacity-55' : ''}`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold ${
                    d.format === 'PDF' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {d.format}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-neutral-950">
                    {d.supplierName ?? 'Riepilogo dell’ordine'}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">{d.fileName}</span>
                </span>
                <span className="tabellare text-xs text-neutral-500">
                  {peso(d.sizeBytes)} · {quando(d.createdAt)}
                  {vecchio && ' · versione precedente'}
                </span>
                <a
                  href={`${base}/${d.id}`}
                  className="text-brand-700 hover:bg-brand-50 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
                >
                  <AppIcon name="download" className="h-4 w-4" />
                  Scarica
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
