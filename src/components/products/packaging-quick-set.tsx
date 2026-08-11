'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/ui';

/**
 * Dire quanti pezzi ci sono nella confezione, senza uscire dall'elenco.
 *
 * Finché non si sa, quell'offerta **non entra in nessun confronto**: il
 * prezzo al litro di un collo di cui non si sa quante bottiglie contenga non
 * è un dato, è un'ipotesi — e sbagliata di ventiquattro volte.
 *
 * ── Perché i numeri sono già lì ─────────────────────────────────────────
 * La versione di prima chiedeva prima «è un pezzo o un collo?» e poi, in un
 * secondo passaggio, il numero. Due decisioni per una cosa sola: chi scorre
 * cento prodotti si ferma alla quinta. Ora le pezzature che ricorrono
 * davvero — 6, 12, 24 — sono un clic, e «altro» resta per il resto.
 */

const COMUNI = [6, 12, 24];

export function PackagingQuickSet({
  supplierProductId,
  supplierName,
  endpoint,
}: {
  supplierProductId: string;
  supplierName: string;
  /** L'endpoint delle confezioni, non quello dell'offerta. */
  endpoint: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [aperto, setAperto] = useState(false);
  const [altro, setAltro] = useState('');
  const [attesa, setAttesa] = useState(false);

  async function salva(pezzi: number) {
    if (!Number.isInteger(pezzi) || pezzi < 1) return;
    setAttesa(true);
    try {
      const risposta = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ supplierProductId, pezzi }),
      });
      const corpo = (await risposta.json()) as { ok: boolean; error?: string };
      if (!corpo.ok) {
        toast({ title: 'Non è stato possibile salvare', description: corpo.error, tone: 'error' });
        return;
      }
      toast({
        title: pezzi === 1 ? 'Segnata come pezzo singolo' : `Confezione da ${pezzi}`,
        description: 'Ora entra nei confronti, col prezzo al litro giusto.',
        tone: 'success',
      });
      setAperto(false);
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  if (!aperto) {
    return (
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="cursor-pointer rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] leading-4 font-semibold text-amber-800 transition-colors hover:bg-amber-100"
        title={`${supplierName} non dichiara quanti pezzi contiene: finché manca, questo articolo resta fuori dai confronti`}
      >
        quanti pezzi? →
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {COMUNI.map((n) => (
        <button
          key={n}
          type="button"
          disabled={attesa}
          onClick={() => void salva(n)}
          className="hover:border-brand-400 hover:bg-brand-50 min-h-7 min-w-8 cursor-pointer rounded-md border border-neutral-300 bg-white px-1.5 text-xs font-bold text-neutral-800 transition-colors disabled:opacity-60"
        >
          {n}
        </button>
      ))}
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={10_000}
        value={altro}
        onChange={(e) => setAltro(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void salva(Number(altro));
          }
        }}
        placeholder="altro"
        aria-label="Pezzi per confezione"
        disabled={attesa}
        className="focus:border-brand-500 min-h-7 w-16 rounded-md border border-neutral-300 px-1.5 text-xs outline-none"
      />
      {/* Il fornitore scrive «collo» anche quando vende il pezzo: capita, e
          senza questa via d'uscita l'unico modo sarebbe scrivere «1». */}
      <button
        type="button"
        disabled={attesa}
        onClick={() => void salva(1)}
        className="min-h-7 cursor-pointer px-1 text-xs text-neutral-500 underline hover:text-neutral-800 disabled:opacity-60"
      >
        è singolo
      </button>
      <button
        type="button"
        onClick={() => setAperto(false)}
        className="min-h-7 cursor-pointer px-1 text-xs text-neutral-400 hover:text-neutral-700"
        aria-label="Annulla"
      >
        ✕
      </button>
    </span>
  );
}
