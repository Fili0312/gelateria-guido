'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/ui';

/**
 * Dire quanti pezzi ci sono nella confezione, sul posto.
 *
 * Finché non si sa, quell'offerta **non entra in nessun confronto**: il
 * prezzo al litro di un collo di cui non si sa quante bottiglie contenga non
 * è un dato, è un'ipotesi. Sono due clic, e ognuno sblocca un prodotto.
 *
 * Le due risposte non sono simmetriche: «è un pezzo solo» è un clic secco
 * perché è il caso più frequente e più certo; «è un collo» chiede il numero,
 * perché senza numero non si è risolto niente.
 */
export function PackagingQuickSet({
  supplierProductId,
  supplierName,
  endpoint,
}: {
  supplierProductId: string;
  supplierName: string;
  endpoint: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [aperto, setAperto] = useState(false);
  const [pezzi, setPezzi] = useState('');
  const [attesa, setAttesa] = useState(false);

  async function salva(quantita: number) {
    setAttesa(true);
    try {
      const risposta = await fetch(`${endpoint}/${supplierProductId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ packQuantity: quantita, packQuantityConfirmed: true }),
      });
      const corpo = (await risposta.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!risposta.ok || !corpo?.ok) {
        toast({ title: 'Non è stato possibile salvare', description: corpo?.error, tone: 'error' });
        return;
      }
      toast({
        title: quantita === 1 ? 'Segnato come pezzo singolo' : `Collo da ${quantita}`,
        description: 'Ora questa offerta entra nei confronti.',
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
        title={`Il prezzo di ${supplierName} non entra nei confronti finché non si sa quanti pezzi ha la confezione`}
        className="cursor-pointer rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 transition-colors hover:border-amber-400 hover:bg-amber-100"
      >
        confezione da definire →
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1">
      <span className="text-[11px] text-amber-900">Quanti pezzi?</span>
      <button
        type="button"
        disabled={attesa}
        onClick={() => void salva(1)}
        className="min-h-8 cursor-pointer rounded border border-neutral-300 bg-white px-2 text-xs font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-50"
      >
        1, è singolo
      </button>
      <input
        type="number"
        min={2}
        max={9999}
        value={pezzi}
        onChange={(e) => setPezzi(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && Number(pezzi) >= 2) void salva(Number(pezzi));
          if (e.key === 'Escape') setAperto(false);
        }}
        placeholder="24"
        aria-label="Pezzi per confezione"
        className="tabellare h-8 w-16 rounded border border-neutral-300 px-2 text-xs outline-none focus:border-amber-500"
      />
      <button
        type="button"
        disabled={attesa || Number(pezzi) < 2}
        onClick={() => void salva(Number(pezzi))}
        className="min-h-8 cursor-pointer rounded bg-amber-600 px-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
      >
        È un collo
      </button>
      <button
        type="button"
        onClick={() => setAperto(false)}
        aria-label="Annulla"
        className="cursor-pointer px-1 text-xs text-neutral-500 hover:text-neutral-800"
      >
        ×
      </button>
    </span>
  );
}
