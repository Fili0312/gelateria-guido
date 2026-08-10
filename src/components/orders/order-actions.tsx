'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import type { EsitoRiordino, OrderApiBody } from '@/features/orders/dto';
import { euro } from '@/features/products/format';

/**
 * Riordinare e annullare, dal dettaglio di un ordine.
 *
 * ── Riordina ────────────────────────────────────────────────────────────
 * Rimette le righe nella bozza **ai prezzi di oggi**, e dice cosa è cambiato.
 * Un riordino che salta tre articoli in silenzio è peggio di uno che
 * fallisce: la mancanza si scopre alla consegna, quando non si può più fare
 * niente.
 *
 * L'esito resta sullo schermo finché non si va via: sono le informazioni per
 * cui si è premuto, e un toast che sparisce dopo tre secondi le porta con sé.
 */
export function OrderActions({
  orderId,
  annullabile,
  endpointOrdini,
}: {
  orderId: string;
  annullabile: boolean;
  endpointOrdini: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState<'riordina' | 'annulla' | null>(null);
  const [esito, setEsito] = useState<EsitoRiordino | null>(null);

  async function riordina() {
    if (
      !confirm(
        'Rimettere questo ordine nella bozza?\n\n' +
          'I prezzi saranno quelli di oggi, non quelli di allora. Se l’ordine in corso ha già ' +
          'delle righe, verranno tolte.',
      )
    ) {
      return;
    }
    setAttesa('riordina');
    try {
      const risposta = await fetch(`${endpointOrdini}/${orderId}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const corpo = (await risposta.json()) as OrderApiBody<EsitoRiordino>;
      if (!corpo.ok) {
        toast({ title: 'Non è stato possibile riordinare', description: corpo.error, tone: 'error' });
        return;
      }
      setEsito(corpo.data);
      toast({
        title: `${corpo.data.copiate} righe rimesse nell’ordine`,
        description:
          corpo.data.saltate.length > 0
            ? `${corpo.data.saltate.length} non si sono potute rimettere: guarda qui sotto.`
            : undefined,
        tone: 'success',
      });
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(null);
    }
  }

  async function annulla() {
    if (
      !confirm(
        'Annullare questo ordine?\n\nResta nello storico col suo numero: annullarlo non lo cancella.',
      )
    ) {
      return;
    }
    setAttesa('annulla');
    try {
      const risposta = await fetch(`${endpointOrdini}/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const corpo = (await risposta.json()) as OrderApiBody<unknown>;
      if (!corpo.ok) {
        toast({ title: 'Non è stato possibile annullare', description: corpo.error, tone: 'error' });
        return;
      }
      toast({ title: 'Ordine annullato', tone: 'success' });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void riordina()} disabled={attesa !== null} className="min-h-11">
          {attesa === 'riordina' ? 'Sto riordinando…' : 'Riordina'}
        </Button>
        {annullabile && (
          <button
            type="button"
            onClick={() => void annulla()}
            disabled={attesa !== null}
            className="min-h-11 cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-60"
          >
            {attesa === 'annulla' ? 'Annullo…' : 'Annulla l’ordine'}
          </button>
        )}
      </div>

      {esito && (
        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-sm font-semibold text-neutral-950">
            {esito.copiate} righe rimesse nell’ordine in corso
            {esito.bozzaSvuotata && (
              <span className="font-normal text-neutral-500"> · la bozza precedente è stata svuotata</span>
            )}
          </p>

          {esito.cambiate.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-800">
                {esito.cambiate.length} prezzi cambiati da allora
              </p>
              <ul className="mt-1 space-y-0.5 text-xs leading-5 text-neutral-600">
                {esito.cambiate.map((c) => (
                  <li key={`${c.name}-${c.supplierName}`}>
                    <strong className="text-neutral-900">{c.name}</strong> · {c.supplierName}:{' '}
                    {euro(c.prezzoAllora)} → {euro(c.prezzoAdesso)} (
                    {Number(c.differenza) > 0 ? '+' : ''}
                    {euro(c.differenza)})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {esito.saltate.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-800">
                {esito.saltate.length} non si sono potute rimettere
              </p>
              <ul className="mt-1 space-y-0.5 text-xs leading-5 text-neutral-600">
                {esito.saltate.map((s) => (
                  <li key={`${s.name}-${s.supplierName}`}>
                    <strong className="text-neutral-900">{s.name}</strong> · {s.supplierName}:{' '}
                    {s.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {esito.copiate > 0 && (
            <a
              href="../ordini"
              className="text-brand-700 inline-block cursor-pointer text-sm font-semibold hover:underline"
            >
              Vai all’ordine in corso →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
