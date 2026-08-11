'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { formatoUnitario } from '@/features/products/format';
import { etichettaImballo } from '@/features/products/format';
import type { UnitOfMeasureValue } from '@/features/products/schema';
import type { GruppoDaDefinire } from '@/server/repositories/supplier-products';

/**
 * Dire quanti pezzi contiene un collo, un gruppo alla volta.
 *
 * ── Perché a gruppi ─────────────────────────────────────────────────────
 * Un fornitore usa una convenzione, non un capriccio per articolo: se
 * cecconi manda le bibite da 20 cl in colli, sono ventiquattro per tutte e
 * dodici le referenze. Chiederlo dodici volte fa smettere alla quinta, e
 * restano sette prodotti fuori da ogni confronto.
 *
 * ── Perché conta ────────────────────────────────────────────────────────
 * Finché il numero manca, il prezzo al litro è calcolato come se il collo
 * fosse un pezzo solo: 13,76 € per una bottiglietta da 20 cl diventa 68,80
 * €/L. Non è un numero un po' impreciso, è un numero che farebbe scartare il
 * fornitore giusto. Per questo l'app quegli unitari non li mostra affatto.
 */

/** Le pezzature che ricorrono davvero sui colli di bibite e bottiglie. */
const COMUNI = [6, 12, 15, 20, 24];

function Gruppo({ gruppo, endpoint }: { gruppo: GruppoDaDefinire; endpoint: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pezzi, setPezzi] = useState('');
  const [attesa, setAttesa] = useState(false);

  async function salva(quantita: number) {
    setAttesa(true);
    try {
      const risposta = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          supplierId: gruppo.supplierId,
          packagingType: gruppo.packagingType,
          unitSize: gruppo.unitSize,
          unitOfMeasure: gruppo.unitOfMeasure,
          pezzi: quantita,
        }),
      });
      const corpo = (await risposta.json()) as
        | { ok: true; data: { offerte: number; prezziRicalcolati: number } }
        | { ok: false; error: string };
      if (!corpo.ok) {
        toast({ title: 'Non è stato possibile salvare', description: corpo.error, tone: 'error' });
        return;
      }
      toast({
        title: `${corpo.data.offerte} ${corpo.data.offerte === 1 ? 'articolo sistemato' : 'articoli sistemati'}`,
        description: `Ora entrano nei confronti, col prezzo al litro giusto.`,
        tone: 'success',
      });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  const imballo = etichettaImballo(gruppo.packagingType) ?? 'confezione';
  const formato = formatoUnitario(gruppo.unitSize, gruppo.unitOfMeasure as UnitOfMeasureValue);
  const numero = Number(pezzi);
  const valido = Number.isInteger(numero) && numero >= 1 && numero <= 10_000;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-black text-neutral-950">
          Un {imballo} di {formato} — {gruppo.supplierName}
        </h2>
        <span className="text-sm font-semibold text-amber-700">
          {gruppo.quante} {gruppo.quante === 1 ? 'articolo' : 'articoli'}
        </span>
      </div>

      <p className="mt-1 text-sm leading-5 text-neutral-500">
        {gruppo.esempi.join(' · ')}
        {gruppo.quante > gruppo.esempi.length &&
          ` · e altri ${gruppo.quante - gruppo.esempi.length}`}
      </p>

      <p className="mt-3 text-sm font-semibold text-neutral-800">Quanti pezzi ci sono dentro?</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {COMUNI.map((n) => (
          <button
            key={n}
            type="button"
            disabled={attesa}
            onClick={() => void salva(n)}
            className="hover:border-brand-400 hover:bg-brand-50 min-h-11 min-w-14 cursor-pointer rounded-lg border border-neutral-300 bg-white px-3 text-sm font-bold text-neutral-800 transition-colors disabled:opacity-60"
          >
            {n}
          </button>
        ))}
        <span className="text-sm text-neutral-400">oppure</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={10_000}
          value={pezzi}
          onChange={(e) => setPezzi(e.target.value)}
          placeholder="altro"
          aria-label={`Pezzi per ${imballo} di ${formato}`}
          className="focus:border-brand-500 focus:ring-brand-500/30 min-h-11 w-24 rounded-lg border border-neutral-300 px-3 text-sm outline-none focus:ring-4"
        />
        <Button
          onClick={() => void salva(numero)}
          disabled={attesa || !valido}
          className="min-h-11"
        >
          {attesa ? 'Salvo…' : 'Applica a tutti'}
        </Button>
      </div>

      {/* Il caso che sembra strano ma capita: il fornitore scrive «collo»
          anche quando vende il pezzo singolo. */}
      <button
        type="button"
        disabled={attesa}
        onClick={() => void salva(1)}
        className="mt-3 cursor-pointer text-xs text-neutral-500 underline hover:text-neutral-800 disabled:opacity-60"
      >
        Li vende a pezzo singolo, nonostante scriva «{imballo}»
      </button>
    </section>
  );
}

export function PackagingGroups({
  gruppi,
  endpoint,
}: {
  gruppi: GruppoDaDefinire[];
  endpoint: string;
}) {
  if (gruppi.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-green-300 bg-green-50/60 px-5 py-12 text-center">
        <h2 className="text-lg font-black text-green-950">Nessuna confezione da definire</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-green-900/75">
          Per ogni offerta a catalogo si sa quanti pezzi contiene la confezione, quindi il prezzo al
          litro è reale e tutti i prodotti possono entrare nei confronti.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {gruppi.map((g) => (
        <Gruppo
          key={`${g.supplierId}|${g.packagingType ?? ''}|${g.unitSize}|${g.unitOfMeasure}`}
          gruppo={g}
          endpoint={endpoint}
        />
      ))}
    </div>
  );
}
