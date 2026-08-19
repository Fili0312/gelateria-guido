'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui';
import type { OffertaScontabile } from '@/features/products/dto';

/**
 * «Questo lo sconta o no?», dall'elenco.
 *
 * Compare **solo** sui prodotti di un fornitore che ha uno sconto concordato:
 * su tutti gli altri non c'è niente da dire, e un comando che non serve è un
 * comando che l'occhio impara a saltare — anche quando invece servirebbe.
 *
 * Di default sono tutti «sì», perché l'accordo è «tutti tranne alcuni»:
 * partire dal contrario vorrebbe dire premere trecento volte per ottenere lo
 * stato in cui si è già.
 *
 * Non chiede conferma e non ricarica la pagina: si scorre l'elenco e si
 * premono quelli da escludere, uno dopo l'altro. Se una chiamata fallisce il
 * pulsante torna com'era e lo dice — è l'unico modo perché quello che si vede
 * resti quello che c'è scritto nel database.
 */
export function DiscountToggle({
  offerta,
  endpoint,
  mostraFornitore,
}: {
  offerta: OffertaScontabile;
  endpoint: string;
  /** Il nome del fornitore serve solo quando ce n'è più d'uno da distinguere. */
  mostraFornitore: boolean;
}) {
  const { toast } = useToast();
  const [esclusa, setEsclusa] = useState(offerta.esclusa);
  const [attesa, setAttesa] = useState(false);

  async function cambia() {
    const nuovo = !esclusa;
    setEsclusa(nuovo);
    setAttesa(true);
    try {
      const risposta = await fetch(`${endpoint}/${offerta.supplierProductId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ extraDiscountExcluded: nuovo }),
      });
      const corpo = (await risposta.json().catch(() => null)) as {
        ok: boolean;
        error?: string;
      } | null;
      if (!risposta.ok || !corpo?.ok) {
        setEsclusa(!nuovo);
        toast({ title: 'Non è stato possibile salvare', description: corpo?.error, tone: 'error' });
      }
    } catch {
      setEsclusa(!nuovo);
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void cambia()}
      disabled={attesa}
      aria-pressed={!esclusa}
      title={
        esclusa
          ? `${offerta.supplierName} non applica lo sconto su questo articolo. Premi per rimetterlo dentro.`
          : `${offerta.supplierName} applica lo sconto del ${offerta.pct}% su questo articolo. Premi per escluderlo.`
      }
      className={`inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
        esclusa
          ? 'border-neutral-300 bg-white text-neutral-500 hover:border-neutral-400'
          : 'border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200'
      }`}
    >
      {mostraFornitore && <span className="font-normal opacity-70">{offerta.supplierName}</span>}
      {esclusa ? 'no sconto' : `−${offerta.pct}%`}
    </button>
  );
}
