'use client';

import { useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';

/**
 * Far leggere il confronto a un modello.
 *
 * Il pulsante dice cosa fa e cosa **non** fa, perché è la differenza che
 * rende questa funzione affidabile: i numeri sono già calcolati e verificati
 * dal codice, il modello li commenta. Se sbaglia, sbaglia un consiglio — non
 * può sbagliare un prezzo.
 *
 * Non parte da solo all'apertura della pagina: è una chiamata a pagamento, e
 * una spesa che si avvia guardando una pagina è una spesa che nessuno ha
 * deciso.
 */
export function AiReading({ endpoint, disponibile }: { endpoint: string; disponibile: boolean }) {
  const { toast } = useToast();
  const [attesa, setAttesa] = useState(false);
  const [testo, setTesto] = useState<string | null>(null);
  const [daCache, setDaCache] = useState(false);

  async function leggi() {
    setAttesa(true);
    try {
      const risposta = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      });
      const corpo = (await risposta.json()) as {
        ok: boolean;
        data?: { testo: string; daCache: boolean };
        error?: string;
      };
      if (!corpo.ok || !corpo.data) {
        toast({ title: 'Lettura non riuscita', description: corpo.error, tone: 'error' });
        return;
      }
      setTesto(corpo.data.testo);
      setDaCache(corpo.data.daCache);
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setAttesa(false);
    }
  }

  if (!disponibile) return null;

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-black text-neutral-950">
            <AppIcon name="sparkles" className="h-4 w-4 text-violet-600" />
            Fatti leggere i numeri
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-600">
            I conti li fa l’app e sono già verificati. Al modello si chiede solo{' '}
            <strong>da dove conviene cominciare</strong> e cosa lasciar stare. È una chiamata a
            pagamento, contata sul budget mensile.
          </p>
        </div>
        <button
          type="button"
          disabled={attesa}
          onClick={() => void leggi()}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
        >
          <AppIcon name="sparkles" className="h-4 w-4" />
          {attesa ? 'Sto leggendo…' : testo ? 'Rileggi' : 'Elabora con IA'}
        </button>
      </div>

      {testo && (
        <div className="mt-3 rounded-xl border border-violet-200 bg-white p-4">
          <p className="text-sm leading-6 whitespace-pre-line text-neutral-800">{testo}</p>
          <p className="mt-2 text-xs text-neutral-400">
            Scritto da un modello sui numeri qui sopra{daCache && ' · risposta già in cache, non è costata niente'}.
            Vale come commento, non come calcolo.
          </p>
        </div>
      )}
    </section>
  );
}
