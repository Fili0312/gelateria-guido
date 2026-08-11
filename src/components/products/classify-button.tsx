'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';

/**
 * Dare una categoria ai prodotti, in due passi disuguali.
 *
 * Due pulsanti e non uno, perché fanno cose diverse e costano diversamente,
 * e chi preme ha diritto di saperlo prima. La regola guarda le parole e non
 * costa niente; il modello si occupa solo di ciò che la regola non ha saputo
 * decidere — quello che richiede di sapere che Averna è un amaro e che la
 * Coca Cola è una bibita.
 *
 * Il secondo pulsante compare **solo dopo** il primo: chiedere al modello
 * quello che una lista di parole risolve gratis è spendere per niente.
 */

interface Esito {
  esaminati: number;
  classificati: number;
  dallaRegola: number;
  dalModello: number;
  indecisi: number;
  senzaCategorie: boolean;
  chiamate: number;
}

export function ClassifyButton({
  endpoint,
  daClassificare,
}: {
  endpoint: string;
  daClassificare: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [attesa, setAttesa] = useState<'regola' | 'ia' | null>(null);
  const [ultimo, setUltimo] = useState<Esito | null>(null);

  if (daClassificare === 0 && !ultimo) return null;

  async function classifica(usaModello: boolean) {
    if (
      usaModello &&
      !confirm(
        'Chiedere al modello di classificare i prodotti rimasti?\n\n' +
          'È una chiamata a pagamento, contata sul budget mensile. Le proposte ' +
          'si possono correggere a mano dopo.',
      )
    ) {
      return;
    }

    setAttesa(usaModello ? 'ia' : 'regola');
    try {
      const risposta = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ usaModello }),
      });
      const corpo = (await risposta.json()) as { ok: boolean; data?: Esito; error?: string };
      if (!corpo.ok || !corpo.data) {
        toast({ title: 'Classificazione non riuscita', description: corpo.error, tone: 'error' });
        return;
      }
      setUltimo(corpo.data);
      const d = corpo.data;

      // Le categorie le decide chi usa l'app: senza, non c'è dove mettere i
      // prodotti, e dirlo è più utile di «0 classificati».
      if (d.senzaCategorie) {
        toast({
          title: 'Non ci sono categorie',
          description:
            'I prodotti si classificano dentro le categorie che crei tu: aprine qualcuna in «Reparti e categorie» e riprova.',
          tone: 'error',
        });
        return;
      }

      toast({
        title: usaModello
          ? `${d.dalModello} classificati dal modello`
          : `${d.dallaRegola} classificati dalla regola`,
        description:
          d.indecisi > 0
            ? `Ne restano ${d.indecisi} senza categoria.`
            : 'Non ne resta nessuno senza categoria.',
        tone: 'success',
      });
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(null);
    }
  }

  const restano = ultimo?.indecisi ?? daClassificare;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {daClassificare > 0 && (
        <button
          type="button"
          disabled={attesa !== null}
          onClick={() => void classifica(false)}
          className="focus-visible:ring-brand-600 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-400 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:outline-none"
          title="Guarda le parole della descrizione. Non costa niente."
        >
          <AppIcon name="check" className="h-4 w-4" />
          {attesa === 'regola' ? 'Sto classificando…' : `Classifica ${daClassificare}`}
        </button>
      )}

      {ultimo && restano > 0 && (
        <button
          type="button"
          disabled={attesa !== null}
          onClick={() => void classifica(true)}
          className="focus-visible:ring-brand-600 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 text-sm font-semibold text-violet-800 transition-colors hover:border-violet-400 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:outline-none"
          title="Solo i rimasti, quelli che richiedono di sapere cosa sono le cose. Chiamata a pagamento."
        >
          <AppIcon name="sparkles" className="h-4 w-4" />
          {attesa === 'ia' ? 'Sto chiedendo…' : `Elabora con IA i ${restano} rimasti`}
        </button>
      )}

      {ultimo && (
        <span className="text-xs text-neutral-500">
          {ultimo.dallaRegola > 0 && `${ultimo.dallaRegola} dalla regola`}
          {ultimo.dalModello > 0 && ` · ${ultimo.dalModello} dal modello`}
          {ultimo.chiamate > 0 && ` · ${ultimo.chiamate} chiamate`}
        </span>
      )}
    </div>
  );
}
